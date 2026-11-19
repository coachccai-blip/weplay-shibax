// Cadre commun des jeux : lobby, déroulé, synchronisation, reprise, fin de partie.
// Chaque changement d'état s'écrit de façon conditionnelle (ETag) : une seule requête le déclenche.
// Sans serveur permanent, c'est la première interrogation reçue après une échéance qui fait avancer la partie.
import { K, lastSegment } from '../keys.js'
import { SKIP, pMap } from '../db.js'
import { fail, ensure, str, int, bool } from '../http.js'
import { isMember, postMessage } from '../messages.js'
import { loadMemberRoom, touchPresence } from '../rooms.js'
import { finishSideEffects } from '../rewards.js'
import { activeIds, isPresent, ACTIVE_MS } from './common.js'
import drawit from './drawit.js'
import testgame from './testgame.js'
import { GAME_ID_RE, newGameId, DEVICE_ID_RE } from '../../shared/ids.js'
import { LIMITS } from '../../shared/constants.js'

export const MODULES = { drawit, test: testgame }

export const testGameEnabled = () => process.env.SHX_ENABLE_TEST_GAME === '1'

export function moduleFor(type) {
  const mod = MODULES[type]
  ensure(mod && (type !== 'test' || testGameEnabled()), 400, 'game_type', 'Ce jeu n’est pas disponible.')
  return mod
}

const LIVE = new Set(['lobby', 'playing'])
const OVER = new Set(['finished', 'cancelled'])

export function isActiveGame(state, now = Date.now()) {
  if (!state) return false
  if (state.status === 'lobby') return now < state.lobbyExpiresAt
  return state.status === 'playing'
}

function playerFrom(user, now, extra = {}) {
  return { id: user.id, pseudo: user.pseudo, coat: user.coat, acc: user.acc || [], joinedAt: now, left: false, ...extra }
}

// ---------- Vues ----------

export function gameView(state, uid, now = Date.now()) {
  const mod = MODULES[state.type]
  const active = activeIds(state)
  return {
    id: state.id,
    type: state.type,
    rid: state.rid,
    status: state.status,
    v: state.v,
    hostId: state.hostId,
    createdBy: state.createdBy,
    createdAt: state.createdAt,
    lobbyExpiresAt: state.lobbyExpiresAt,
    startedAt: state.startedAt || null,
    endedAt: state.endedAt || null,
    endReason: state.endReason || null,
    settings: state.settings,
    estimateSec: mod.estimate(state.settings, Math.max(active.length, mod.minPlayers)),
    minPlayers: mod.minPlayers,
    maxPlayers: mod.maxPlayers,
    players: state.joinOrder
      .filter((id) => state.players[id])
      .map((id) => {
        const p = state.players[id]
        return { id, pseudo: p.pseudo, coat: p.coat, acc: p.acc, left: !!p.left, late: !!p.late, fromRound: p.fromRound || 0, score: state.scores[id] || 0, found: state.found[id] || 0 }
      }),
    me: { isPlayer: !!state.players[uid] && !state.players[uid].left, isHost: state.hostId === uid },
    g: state.g ? mod.view(state, uid, now) : null,
    results: state.results || null,
    rewards: state.rewardsDone ? state.rewards || {} : null,
    rewardsDone: !!state.rewardsDone,
    nextGameId: state.nextGameId || null,
    prevGameId: state.prevGameId || null,
  }
}

/** Résumé d'une partie pour les cartes du fil (invitation, résultats) et le bandeau. */
export function gameSummary(state) {
  const players = state.joinOrder.filter((id) => state.players[id] && !state.players[id].left).map((id) => {
    const p = state.players[id]
    return { id, pseudo: p.pseudo, coat: p.coat, acc: p.acc }
  })
  return {
    id: state.id,
    type: state.type,
    status: state.status === 'lobby' && Date.now() >= state.lobbyExpiresAt ? 'cancelled' : state.status,
    hostId: state.hostId,
    settings: state.settings,
    players,
    maxPlayers: MODULES[state.type].maxPlayers,
    createdAt: state.createdAt,
    endedAt: state.endedAt || null,
    endReason: state.endReason || null,
    podium: state.results ? state.results.ranking.slice(0, 3).map((r) => ({ ...r, pseudo: state.players[r.uid]?.pseudo, coat: state.players[r.uid]?.coat, acc: state.players[r.uid]?.acc })) : null,
    drawings: state.results?.drawings || [],
    nextGameId: state.nextGameId || null,
  }
}

// ---------- Faits nécessaires aux transitions ----------

function parseRoundKeys(prefix, keys) {
  const out = { strokes: [], guesses: [], foundIds: [], taps: [], hasFirst: false }
  for (const key of keys) {
    const rest = key.slice(prefix.length)
    if (rest === 'first') out.hasFirst = true
    else if (rest.startsWith('s/')) {
      const [dev, seq] = rest.slice(2).split('.')
      out.strokes.push({ key, dev, seq: Number(seq) })
    } else if (rest.startsWith('g/')) {
      const id = rest.slice(2)
      const [ts, uid, kind] = id.split('_')
      out.guesses.push({ id, ts: Number(ts), uid, kind })
    } else if (rest.startsWith('f/')) out.foundIds.push(rest.slice(2))
    else if (rest.startsWith('t/')) out.taps.push(rest.slice(2))
  }
  return out
}

async function loadHeartbeats(db, state) {
  const ids = activeIds(state)
  const out = {}
  await pMap(ids, async (uid) => {
    const hb = await db.get(K.heartbeat(state.id, uid))
    if (hb?.ts) out[uid] = hb.ts
  }, 8)
  return out
}

function mergeSeen(facts, seen) {
  if (seen) for (const [uid, ts] of Object.entries(seen)) facts.hb[uid] = Math.max(facts.hb[uid] || 0, ts)
  return facts
}

export async function gatherFacts(db, state, now, { full = false, seen = null } = {}) {
  const facts = { now, hb: {}, hbLoaded: false, round: -1, keys: [], strokes: [], guesses: [], foundIds: [], taps: [], founds: null, first: null }
  if (state.status === 'lobby') {
    if (full || now >= state.lobbyExpiresAt) {
      facts.hb = await loadHeartbeats(db, state)
      facts.hbLoaded = true
    }
    return mergeSeen(facts, seen)
  }
  if (state.status !== 'playing') return mergeSeen(facts, seen)
  const mod = MODULES[state.type]
  const r = mod.roundIndex(state)
  const watch = mod.watchUid(state)
  const prefix = K.roundPrefix(state.id, r)
  const [keys, watched] = await Promise.all([r >= 0 ? db.keys(prefix) : [], watch ? db.get(K.heartbeat(state.id, watch)) : null])
  Object.assign(facts, { round: r, keys }, parseRoundKeys(prefix, keys))
  if (watched?.ts) facts.hb[watch] = watched.ts
  mergeSeen(facts, seen)
  if (full || mod.needsFullFacts(state, now, facts)) {
    const [hb, founds, first] = await Promise.all([
      loadHeartbeats(db, state),
      mod.needsFounds && r >= 0 ? pMap(facts.foundIds, (uid) => db.get(K.found(state.id, r, uid)), 8) : [],
      mod.needsFounds && facts.hasFirst ? db.get(K.first(state.id, r)) : null,
    ])
    facts.hb = { ...facts.hb, ...hb }
    facts.hbLoaded = true
    facts.founds = founds.filter(Boolean)
    facts.first = first
    mergeSeen(facts, seen)
  }
  return facts
}

// ---------- Transitions ----------

function endGame(state, now, reason) {
  const mod = MODULES[state.type]
  state.status = 'finished'
  state.endedAt = now
  state.endReason = reason
  state.results = mod.finalize(state)
}

function cancelGame(state, now, reason) {
  state.status = 'cancelled'
  state.endedAt = now
  state.endReason = reason
}

const api = { endGame }

function transferHost(state, facts, now) {
  const candidates = activeIds(state).filter((u) => u !== state.hostId)
  if (!candidates.length) return false
  const present = candidates.find((u) => isPresent(state, facts, u, now, ACTIVE_MS)) || candidates[0]
  state.hostId = present
  return true
}

/** Avance la partie si une échéance est passée ou une condition remplie. Fonction pure. */
export function tickGame(state, now, facts) {
  const mod = MODULES[state.type]
  if (state.status === 'lobby') {
    if (now >= state.lobbyExpiresAt) {
      cancelGame(state, now, 'timeout')
      return true
    }
    if (facts.hbLoaded && state.players[state.hostId] && !isPresent(state, facts, state.hostId, now, ACTIVE_MS)) {
      const others = activeIds(state).filter((u) => u !== state.hostId && isPresent(state, facts, u, now, ACTIVE_MS))
      if (others.length) {
        state.hostId = others[0]
        return true
      }
    }
    return false
  }
  if (state.status !== 'playing') return false
  if (facts.hbLoaded) {
    const present = activeIds(state).filter((u) => isPresent(state, facts, u, now, ACTIVE_MS))
    if (present.length < mod.minPlayers) {
      endGame(state, now, 'not_enough')
      return true
    }
  }
  return mod.tick(state, now, facts, api)
}

async function afterTransition(db, prev, next) {
  if (prev.status === 'lobby' && next.status === 'playing') {
    await db
      .mutate(K.room(next.rid), (r) => {
        if (r.game?.id !== next.id) return SKIP
        r.game.status = 'playing'
      })
      .catch(() => {})
  }
  if (!OVER.has(prev.status) && OVER.has(next.status)) await finishSideEffects(db, next, MODULES[next.type])
}

/**
 * Lecture → faits → modification → écriture conditionnelle, rejouée en cas de conflit.
 * `fn(state, facts)` renvoie true si l'état a changé (une erreur levée annule).
 */
export async function transition(db, gid, fn, { full = false, seen = null, now: fixedNow } = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await db.getE(K.game(gid))
    ensure(cur, 404, 'game_not_found', 'Partie introuvable.')
    const now = fixedNow || Date.now()
    const facts = await gatherFacts(db, cur.data, now, { full, seen })
    const next = structuredClone(cur.data)
    const changed = await fn(next, facts, now)
    if (!changed) return { state: cur.data, facts, changed: false }
    next.v = (next.v || 0) + 1
    next._rev = (cur.data._rev || 0) + 1
    next.updatedAt = now
    const res = await db.putIfMatch(K.game(gid), next, cur.etag)
    if (res.modified) {
      await afterTransition(db, cur.data, next)
      return { state: next, facts, changed: true }
    }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)))
  }
  fail(503, 'busy', 'Beaucoup d’activité dans cette partie, réessaie.')
}

/** Fait avancer la partie autant que nécessaire (enchaînement d'échéances). */
export async function advanceGame(db, gid, { full = false, seen = null } = {}) {
  let last = null
  for (let i = 0; i < 4; i++) {
    last = await transition(db, gid, (state, facts, now) => tickGame(state, now, facts), { full, seen })
    if (!last.changed) break
  }
  const state = last.state
  if (OVER.has(state.status) && !state.rewardsDone) await finishSideEffects(db, state, MODULES[state.type])
  if (last.changed) last = { ...last, facts: await gatherFacts(db, last.state, Date.now(), { full, seen }) }
  return last
}

// ---------- Actions du cadre commun ----------

export async function createGame(db, auth, rid, body) {
  const type = str(body.type, 20) || 'drawit'
  const mod = moduleFor(type)
  const room = await loadMemberRoom(db, auth, rid)
  const now = Date.now()

  // « Rejouer » : même jeu, mêmes joueurs, mêmes réglages.
  let prev = null
  if (body.from && GAME_ID_RE.test(String(body.from))) {
    prev = await db.get(K.game(body.from))
    if (!prev || prev.rid !== rid || prev.type !== type) prev = null
    if (prev?.nextGameId) {
      const next = await db.get(K.game(prev.nextGameId))
      if (isActiveGame(next, now)) return { game: gameView(next, auth.uid, now), existing: true }
    }
  }

  // Un salon n'accueille qu'une partie active à la fois.
  let staleId = null
  if (room.game) {
    let existing = await db.get(K.game(room.game.id))
    if (existing?.status === 'playing') existing = (await advanceGame(db, existing.id, { full: true })).state
    if (isActiveGame(existing, now)) fail(409, 'game_active', 'Une partie est déjà en cours dans ce salon.', { gameId: existing.id })
    staleId = room.game.id
  }
  const gid = newGameId(now)
  await db.mutate(K.room(rid), (r) => {
    ensure(isMember(r, auth.uid), 403, 'not_member', 'Tu ne fais pas partie de ce salon.')
    if (r.game && r.game.id !== staleId) fail(409, 'game_active', 'Une partie vient d’être lancée dans ce salon.', { gameId: r.game.id })
    r.game = { id: gid, type, status: 'lobby', at: now, hostId: auth.uid }
  })

  const settings = prev ? mod.sanitizeSettings(prev.settings, mod.defaultSettings()) : mod.sanitizeSettings(body.settings || {}, mod.defaultSettings())
  const user = await db.get(K.user(auth.uid))
  const players = { [auth.uid]: playerFrom(user, now) }
  const joinOrder = [auth.uid]
  if (prev) {
    const others = prev.joinOrder.filter((u) => u !== auth.uid && prev.players[u] && !prev.players[u].left && isMember(room, u))
    for (const uid of others.slice(0, mod.maxPlayers - 1)) {
      const p = prev.players[uid]
      players[uid] = { id: uid, pseudo: p.pseudo, coat: p.coat, acc: p.acc, joinedAt: now, left: false }
      joinOrder.push(uid)
    }
  }
  const state = {
    id: gid,
    type,
    rid,
    status: 'lobby',
    v: 1,
    createdAt: now,
    createdBy: auth.uid,
    hostId: auth.uid,
    lobbyExpiresAt: now + LIMITS.lobbyTimeoutMs,
    settings,
    players,
    joinOrder,
    scores: {},
    found: {},
    g: null,
    results: null,
    rewardsDone: false,
    rewards: null,
    nextGameId: null,
    prevGameId: prev?.id || null,
  }
  await db.create(K.game(gid), state)
  if (prev) {
    await db
      .mutate(K.game(prev.id), (s) => {
        if (s.nextGameId) return SKIP
        s.nextGameId = gid
        s.v = (s.v || 0) + 1
      })
      .catch(() => {})
  }
  await postMessage(db, rid, { author: auth.uid, type: 'game', kind: 'invite', gid, gtype: type, user })
  return { game: gameView(state, auth.uid, now) }
}

async function loadGameForMember(db, auth, gid) {
  ensure(GAME_ID_RE.test(String(gid)), 404, 'game_not_found', 'Partie introuvable.')
  const state = await db.get(K.game(gid))
  ensure(state, 404, 'game_not_found', 'Partie introuvable.')
  if (!state.players[auth.uid]) await loadMemberRoom(db, auth, state.rid)
  return state
}

export async function getGame(db, auth, gid) {
  await loadGameForMember(db, auth, gid)
  const { state } = await advanceGame(db, gid)
  return { game: gameView(state, auth.uid) }
}

export async function joinGame(db, auth, gid) {
  const base = await loadGameForMember(db, auth, gid)
  await loadMemberRoom(db, auth, base.rid)
  const user = await db.get(K.user(auth.uid))
  const res = await transition(db, gid, (state, facts, now) => {
    const mod = MODULES[state.type]
    ensure(LIVE.has(state.status) && isActiveGame(state, now), 409, 'game_over', 'Cette partie est terminée.')
    const p = state.players[auth.uid]
    if (p && !p.left) return false
    ensure(activeIds(state).length < mod.maxPlayers, 409, 'game_full', `Partie complète : ${mod.maxPlayers} joueurs au maximum.`)
    const late = state.status === 'playing'
    state.players[auth.uid] = playerFrom(user, now, { late })
    if (!state.joinOrder.includes(auth.uid)) state.joinOrder.push(auth.uid)
    if (late) mod.onLateJoin(state, auth.uid)
    if (!state.players[state.hostId] || state.players[state.hostId].left) state.hostId = auth.uid
    return true
  })
  return { game: gameView(res.state, auth.uid) }
}

export async function leaveGame(db, auth, gid) {
  await loadGameForMember(db, auth, gid)
  const res = await transition(
    db,
    gid,
    (state, facts, now) => {
      const mod = MODULES[state.type]
      const p = state.players[auth.uid]
      if (!p || p.left || !LIVE.has(state.status)) return false
      if (state.status === 'lobby') {
        delete state.players[auth.uid]
        state.joinOrder = state.joinOrder.filter((u) => u !== auth.uid)
        if (!activeIds(state).length) cancelGame(state, now, 'empty')
        else if (state.hostId === auth.uid) state.hostId = activeIds(state)[0]
        return true
      }
      p.left = true
      p.leftAt = now
      if (state.hostId === auth.uid) transferHost(state, facts, now)
      mod.onLeave(state, auth.uid, now, facts)
      if (activeIds(state).length < mod.minPlayers) endGame(state, now, 'not_enough')
      return true
    },
    { full: true },
  )
  return { game: gameView(res.state, auth.uid) }
}

export async function updateSettings(db, auth, gid, body) {
  await loadGameForMember(db, auth, gid)
  const res = await transition(db, gid, (state) => {
    const mod = MODULES[state.type]
    ensure(state.status === 'lobby', 409, 'not_lobby', 'La partie a déjà commencé.')
    ensure(state.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte de la partie règle la partie.')
    const next = mod.sanitizeSettings(body.settings || {}, state.settings)
    if (JSON.stringify(next) === JSON.stringify(state.settings)) return false
    state.settings = next
    return true
  })
  return { game: gameView(res.state, auth.uid) }
}

export async function startGame(db, auth, gid) {
  await loadGameForMember(db, auth, gid)
  const res = await transition(
    db,
    gid,
    (state, facts, now) => {
      const mod = MODULES[state.type]
      ensure(state.status === 'lobby' && now < state.lobbyExpiresAt, 409, 'not_lobby', 'Ce lobby n’est plus ouvert.')
      ensure(state.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte peut lancer la partie.')
      const ids = activeIds(state)
      ensure(ids.length >= mod.minPlayers, 409, 'not_enough', `Il faut au moins ${mod.minPlayers} joueurs pour lancer.`)
      const connected = ids.filter((u) => isPresent(state, facts, u, now, ACTIVE_MS))
      ensure(connected.length >= mod.minPlayers, 409, 'not_enough_present', `Il faut au moins ${mod.minPlayers} joueurs connectés pour lancer.`)
      state.players[auth.uid].seenAt = now
      state.status = 'playing'
      state.startedAt = now
      mod.start(state, now, facts, api)
      return true
    },
    { full: true, seen: { [auth.uid]: Date.now() } },
  )
  return { game: gameView(res.state, auth.uid) }
}

function actionContext(db, auth, gid, body, state) {
  return {
    db,
    auth,
    gid,
    body,
    state,
    now: Date.now(),
    transition: (fn, opts) => transition(db, gid, fn, opts),
    advance: (opts) => advanceGame(db, gid, opts),
  }
}

export async function gameAction(db, auth, gid, body) {
  const state = await loadGameForMember(db, auth, gid)
  const result = await MODULES[state.type].act(actionContext(db, auth, gid, body, state))
  return result
}

export async function postStrokes(db, auth, gid, body) {
  const state = await loadGameForMember(db, auth, gid)
  return MODULES[state.type].strokes(actionContext(db, auth, gid, body, state))
}

/** Image d'un dessin terminé (envoyée par le dessinateur, ou à défaut par un devineur). */
export async function saveDrawing(db, auth, gid, round, body) {
  const state = await loadGameForMember(db, auth, gid)
  ensure(state.players[auth.uid], 403, 'not_player', 'Tu ne joues pas dans cette partie.')
  const r = int(round, -1)
  ensure((state.g?.rounds || []).some((x) => x.i === r && x.word), 409, 'no_round', 'Cette manche n’a pas de dessin.')
  const image = str(body.image, 900000)
  const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  ensure(m, 400, 'image', 'Image invalide.')
  const bytes = Buffer.from(m[2], 'base64')
  ensure(bytes.length > 100 && bytes.length <= 600000, 413, 'image_size', 'Image trop lourde.')
  const created = await db.createBytes(K.drawing(gid, r), bytes, { type: m[1], by: auth.uid })
  return { ok: true, created }
}

export async function getDrawing(db, gid, round) {
  ensure(GAME_ID_RE.test(String(gid)), 404, 'not_found', 'Dessin introuvable.')
  const r = int(round, -1)
  const item = await db.getBytes(K.drawing(gid, r))
  if (!item) return new Response('Dessin introuvable', { status: 404, headers: { 'cache-control': 'no-store' } })
  return new Response(item.data, {
    headers: { 'content-type': item.metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable' },
  })
}

export async function getSummary(db, auth, gid) {
  const state = await loadGameForMember(db, auth, gid)
  return { summary: gameSummary(state) }
}

// ---------- Interrogation rapide en partie ----------

/**
 * Renvoie l'état vu par le joueur + les nouveautés (traits, propositions) depuis ses curseurs.
 * `body` : { gid, round, strokes: { [device]: dernierLot }, gAfter, gRecent, beat, full }
 */
export async function syncGame(db, auth, body, ctx) {
  const gid = str(body.gid, 40)
  const base = await loadGameForMember(db, auth, gid)
  const isPlayer = !!base.players[auth.uid] && !base.players[auth.uid].left
  const now = Date.now()
  const beating = isPlayer && bool(body.beat)
  const [{ state, facts }] = await Promise.all([
    advanceGame(db, gid, { full: bool(body.full), seen: isPlayer ? { [auth.uid]: now } : null }),
    beating ? db.put(K.heartbeat(gid, auth.uid), { ts: now }).catch(() => {}) : null,
  ])
  // Jouer dans le salon compte comme être actif dans le salon (pastille de présence).
  if (bool(body.full)) {
    const p = touchPresence(db, state.rid, auth.uid, null, now)
    if (ctx?.waitUntil) ctx.waitUntil(p)
    else await p
  }
  const out = { game: gameView(state, auth.uid, now) }
  if (state.status === 'playing' && facts.round >= 0) {
    const r = facts.round
    out.round = r
    out.foundIds = facts.foundIds
    // Traits : lots de chaque appareil au-delà du curseur du client.
    const cursor = int(body.round, -2) === r && body.strokes && typeof body.strokes === 'object' ? body.strokes : {}
    const wanted = facts.strokes
      .filter((s) => DEVICE_ID_RE.test(s.dev) && s.seq > (Number.isInteger(cursor[s.dev]) ? cursor[s.dev] : -1))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, 400)
    out.strokes = (await pMap(wanted, (s) => db.get(s.key), 24)).filter(Boolean)
    // Propositions : fenêtre de recouvrement, comme pour les messages.
    const sameRound = int(body.round, -2) === r
    const known = new Set(sameRound && Array.isArray(body.gRecent) ? body.gRecent.slice(0, 300).map(String) : [])
    const afterTs = sameRound && body.gAfter ? Number(String(body.gAfter).slice(0, 13)) || 0 : 0
    const fresh = facts.guesses.filter((g) => g.ts >= afterTs - 15000 && !known.has(g.id)).sort((a, b) => (a.id < b.id ? -1 : 1))
    out.guesses = await pMap(fresh, async (g) => {
      if (g.kind === 'w') {
        const entry = await db.get(K.guess(gid, r, g.id))
        return { id: g.id, uid: g.uid, k: 'w', text: entry?.text || '' }
      }
      return { id: g.id, uid: g.uid, k: g.kind }
    }, 16)
  }
  if (bool(body.full) || facts.hbLoaded) {
    const hb = facts.hbLoaded ? facts.hb : await loadHeartbeats(db, state)
    out.presence = { ...hb }
    if (isPlayer) out.presence[auth.uid] = now
  }
  return out
}

export { lastSegment }
