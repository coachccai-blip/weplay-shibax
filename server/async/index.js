// Cadre des jeux « dans la conversation » (asynchrones) : une carte dans le fil, chacun joue à son
// rythme. Chaque coup est une écriture conditionnelle sur l'état du jeu ; un index par groupe porte
// les versions, pour que l'interrogation du salon ne rapporte que les jeux qui ont changé.
import { K, makeMsgId } from '../keys.js'
import { SKIP, pMap } from '../db.js'
import { ensure, str, fail, plainStatus } from '../http.js'
import { loadMemberRoom } from '../rooms.js'
import { postMessage } from '../messages.js'
import { loadProfiles } from '../users.js'
import { applyAsyncRewards, addAsyncToLeaderboards } from '../rewards.js'
import { ASYNC_GAMES, suggestWords, nextSeries } from './games.js'
import { newGameId, GAME_ID_RE } from '../../shared/ids.js'

const MAX_OPEN_PER_ROOM = 20
/** Jeux qui se terminent normalement à leur échéance (dessin, sondage) ; les autres sont abandonnés. */
const ENDS_ON_EXPIRY = new Set(['dessin', 'tupreferes'])

function modFor(type) {
  const mod = ASYNC_GAMES[type]
  ensure(mod, 400, 'game_type', 'Ce jeu n’est pas disponible.')
  return mod
}

export function asyncView(state, uid) {
  const mod = ASYNC_GAMES[state.type]
  return {
    id: state.id,
    type: state.type,
    rid: state.rid,
    lang: state.lang,
    status: state.status,
    v: state.v,
    createdBy: state.createdBy,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    expiresAt: state.expiresAt,
    endedAt: state.endedAt || null,
    open: !!state.open,
    players: state.order,
    me: { isPlayer: state.order.includes(uid) },
    data: mod.view(state, uid),
    result: state.result || null,
  }
}

async function bumpIndex(db, rid, state) {
  await db
    .mutate(
      K.asyncIndex(rid),
      (idx) => {
        idx.games ||= {}
        idx.games[state.id] = { type: state.type, status: state.status, v: state.v, at: state.updatedAt }
        // Derniers dilemmes posés dans le groupe : on évite de les reproposer.
        if (state.type === 'tupreferes' && state.data?.item && !(idx.dilemmas || []).includes(state.data.item)) idx.dilemmas = [state.data.item, ...(idx.dilemmas || [])].slice(0, 60)
        const now = Date.now()
        const keep = Object.entries(idx.games)
          .filter(([, g]) => g.status === 'open' || now - g.at < 3 * 86400000)
          .sort((a, b) => b[1].at - a[1].at)
          .slice(0, 60)
        idx.games = Object.fromEntries(keep)
      },
      { create: () => ({ games: {} }) },
    )
    .catch((e) => console.warn('[async] index', e?.message))
}

function expire(state, now) {
  const mod = ASYNC_GAMES[state.type]
  state.v = (state.v || 0) + 1
  state.updatedAt = now
  state.endedAt = now
  if (ENDS_ON_EXPIRY.has(state.type)) {
    state.data.closed = true
    state.status = 'finished'
    state.result = mod.result(state)
  } else {
    state.status = 'expired'
    state.result = { outcome: 'expired', winners: [] }
  }
}

/** Fin d'un jeu : message de résultat dans le fil, XP et classement du groupe (une seule fois). */
async function finishAsync(db, state) {
  if (state.rewardsDone || state.status !== 'finished') return
  const mod = ASYNC_GAMES[state.type]
  const result = state.result || { outcome: 'over', winners: [] }
  const ids = [...new Set([...state.order, state.createdBy])]
  const profiles = await loadProfiles(db, ids)
  const name = (u) => profiles[u]?.pseudo || 'Shiba'
  const winners = result.winners || []
  const sys = { kind: 'asyncResult', gtype: state.type, outcome: result.outcome }
  if (result.outcome === 'win') {
    sys.winner = name(winners[0])
    sys.others = state.order.filter((u) => !winners.includes(u)).map(name)
  } else if (result.outcome === 'draw') sys.players = state.order.map(name)
  await postMessage(db, state.rid, {
    id: makeMsgId(state.endedAt || Date.now(), 'sys', state.id.slice(-6)),
    ts: state.endedAt || Date.now(),
    author: 'sys',
    type: 'sys',
    sys,
  })
  const gains = {}
  if (!mod.poll) {
    const participants = state.type === 'dessin' ? ids : state.order
    await pMap(participants, async (uid) => {
      const o = await applyAsyncRewards(db, state, uid, winners.includes(uid))
      if (o?.xp) gains[uid] = o.xp
    }, 4)
    if (Object.keys(gains).length) await addAsyncToLeaderboards(db, state, gains)
  }
  await db.mutate(K.asyncGame(state.id), (s) => {
    if (s.rewardsDone) return SKIP
    s.rewardsDone = true
    s.gains = gains
  })
}

/** Revanche d'un duel terminé : mêmes joueurs, l'autre commence, la série continue. */
async function prepareRematch(db, auth, rid, type, room, fromId) {
  ensure(GAME_ID_RE.test(fromId), 404, 'game_not_found', 'Partie introuvable.')
  const prev = await db.get(K.asyncGame(fromId))
  ensure(prev && prev.rid === rid && prev.type === type, 404, 'game_not_found', 'Partie introuvable.')
  ensure(prev.status !== 'open', 409, 'game_active', 'Termine d’abord cette partie !')
  ensure(prev.order.length === 2 && prev.order.includes(auth.uid), 403, 'not_player', 'Tu ne jouais pas dans ce duel.')
  ensure(prev.order.every((u) => room.members.some((m) => m.id === u)), 409, 'opponent', 'Ton adversaire n’est plus dans le groupe.')
  const existing = prev.data.rematch ? await db.get(K.asyncGame(prev.data.rematch)) : null
  return { prev, existing, rematch: { players: [prev.order[1], prev.order[0]], series: nextSeries(prev), target: prev.data.target } }
}

export async function createAsync(db, auth, rid, body) {
  const type = str(body.type, 20)
  const mod = modFor(type)
  const room = await loadMemberRoom(db, auth, rid)
  const options = body.options && typeof body.options === 'object' ? body.options : {}
  const fromId = mod.duel && options.from ? str(options.from, 40) : null
  const ctx = { uid: auth.uid, room, lang: auth.acct.settings?.lang === 'en' ? 'en' : 'fr', now: Date.now() }
  let prevId = null
  if (fromId) {
    const r = await prepareRematch(db, auth, rid, type, room, fromId)
    if (r.existing) return { game: asyncView(r.existing, auth.uid), existing: true }
    ctx.rematch = r.rematch
    prevId = fromId
  }
  const idx = await db.get(K.asyncIndex(rid))
  const openCount = Object.values(idx?.games || {}).filter((g) => g.status === 'open').length
  ensure(openCount < MAX_OPEN_PER_ROOM, 409, 'too_many_async', 'Trop de jeux en cours dans ce groupe : terminez-en quelques-uns !')
  ctx.recentDilemmas = idx?.dilemmas || []
  const now = ctx.now
  const lang = ctx.lang
  const init = mod.create(ctx, options)
  const id = newGameId(now)
  if (prevId) {
    // Une seule revanche par partie : deux demandes simultanées obtiennent la même.
    const locked = await db.create(K.asyncRematch(prevId), { id })
    if (!locked) {
      const lock = await db.get(K.asyncRematch(prevId))
      const other = lock?.id ? await db.get(K.asyncGame(lock.id)) : null
      if (other) return { game: asyncView(other, auth.uid), existing: true }
      fail(409, 'busy', 'La revanche est en cours de création : réessaie dans un instant.')
    }
  }
  if (mod.needsImage) {
    const m = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(str(body.image, 900000))
    ensure(m, 400, 'image', 'Ajoute ton dessin.')
    const bytes = Buffer.from(m[2], 'base64')
    ensure(bytes.length > 100 && bytes.length <= 600000, 413, 'image_size', 'Image trop lourde.')
    await db.createBytes(K.asyncImage(id), bytes, { type: m[1] })
  }
  const state = {
    id,
    type,
    rid,
    lang,
    createdBy: auth.uid,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + init.ttl,
    status: 'open',
    v: 1,
    open: !!init.open,
    order: init.players,
    data: init.data,
    result: null,
    rewardsDone: false,
  }
  await db.create(K.asyncGame(id), state)
  const user = await db.get(K.user(auth.uid))
  await postMessage(db, rid, { author: auth.uid, type: 'game', kind: 'async', agid: id, gtype: type, user })
  await bumpIndex(db, rid, state)
  if (prevId) {
    // L'ancienne carte affiche « Revanche lancée ».
    const res = await db
      .mutate(K.asyncGame(prevId), (s) => {
        if (s.data.rematch) return SKIP
        s.data.rematch = id
        s.v = (s.v || 0) + 1
        s.updatedAt = Date.now()
      })
      .catch(() => null)
    if (res?.changed) await bumpIndex(db, rid, res.value)
  }
  return { game: asyncView(state, auth.uid) }
}

async function loadForMember(db, auth, id) {
  ensure(GAME_ID_RE.test(String(id)), 404, 'game_not_found', 'Partie introuvable.')
  const state = await db.get(K.asyncGame(id))
  ensure(state, 404, 'game_not_found', 'Partie introuvable.')
  const room = await loadMemberRoom(db, auth, state.rid)
  return { state, room }
}

/** Applique l'échéance si elle est passée (personne n'a besoin d'être connecté au bon moment). */
async function settle(db, state) {
  if (state.status !== 'open' || Date.now() <= state.expiresAt) return state
  const res = await db.mutate(K.asyncGame(state.id), (s) => {
    if (s.status !== 'open' || Date.now() <= s.expiresAt) return SKIP
    expire(s, Date.now())
  })
  const next = res.value || state
  await bumpIndex(db, next.rid, next)
  if (next.status === 'finished') await finishAsync(db, next)
  return next
}

export async function getAsync(db, auth, id) {
  const { state } = await loadForMember(db, auth, id)
  const next = await settle(db, state)
  return { game: asyncView(next, auth.uid) }
}

export async function actAsync(db, auth, id, body) {
  const { state: base, room } = await loadForMember(db, auth, id)
  const mod = modFor(base.type)
  const now = Date.now()
  let out = null
  let finished = false
  let expired = false
  const res = await db.mutate(K.asyncGame(id), (s) => {
    finished = false
    expired = false
    if (s.status === 'open' && now > s.expiresAt) {
      expire(s, now)
      expired = true
      finished = s.status === 'finished'
      return
    }
    ensure(s.status === 'open', 409, 'game_over', 'Cette partie est terminée.')
    out = mod.act(s, auth.uid, body || {}, now, { room })
    s.v = (s.v || 0) + 1
    s.updatedAt = now
    if (mod.isOver(s)) {
      s.status = 'finished'
      s.endedAt = now
      s.result = mod.result(s)
      finished = true
    }
  })
  const state = res.value
  await bumpIndex(db, state.rid, state)
  if (finished) await finishAsync(db, state)
  if (expired) fail(409, 'game_over', 'Cette partie est terminée.', { game: asyncView(state, auth.uid) })
  return { game: asyncView(state, auth.uid), ...(out && typeof out === 'object' ? { outcome: out } : {}) }
}

export async function getAsyncImage(db, id) {
  ensure(GAME_ID_RE.test(String(id)), 404, 'not_found', 'Dessin introuvable.')
  const item = await db.getBytes(K.asyncImage(id))
  if (!item) return new Response('Dessin introuvable', { status: plainStatus(404), headers: { 'cache-control': 'no-store' } })
  return new Response(item.data, { headers: { 'content-type': item.metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable' } })
}

export function asyncSuggestions(auth, lang) {
  return { words: suggestWords(lang === 'en' || (lang !== 'fr' && auth.acct.settings?.lang === 'en') ? 'en' : 'fr') }
}

/**
 * Pour l'interrogation du salon : versions des jeux de conversation du groupe, et l'état complet
 * des seuls jeux nouveaux ou modifiés depuis la dernière fois (`known` = { id: version }).
 */
export async function asyncChanges(db, auth, rid, known = {}, { limit = 10, index = null } = {}) {
  const idx = index || (await db.get(K.asyncIndex(rid)))
  const entries = Object.entries(idx?.games || {})
  const changed = entries.filter(([id, g]) => !(Number(known?.[id]) >= g.v)).slice(0, limit)
  const states = (await pMap(changed, ([id]) => db.get(K.asyncGame(id)), 8)).filter(Boolean)
  const games = []
  for (const s of states) games.push(asyncView(await settle(db, s), auth.uid))
  const versions = Object.fromEntries(entries.map(([id, g]) => [id, g.v]))
  return { versions, games }
}
