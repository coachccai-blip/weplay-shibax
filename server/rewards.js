// Fin de partie : XP, niveaux, badges, série, classement du salon, carte de résultats.
// Tout est idempotent : rejouer la fin d'une partie n'attribue jamais l'XP deux fois
// (chaque profil garde la liste des parties déjà comptées, mise à jour dans la même écriture).
import { K, makeMsgId } from './keys.js'
import { SKIP, pMap } from './db.js'
import { postMessage } from './messages.js'
import { parisDay, dayDiff, parisWeek, previousWeek, weekLabel } from '../shared/time.js'
import { computeGameXp, computeAsyncXp, levelFromXp, ACCESSORIES } from '../shared/progression.js'

/** Applique les récompenses d'un joueur (une seule fois par partie). */
export async function applyPlayerRewards(db, state, entry, mod) {
  const gid = state.id
  const endedAt = state.endedAt
  const today = parisDay(endedAt)
  let outcome = null
  const res = await db.mutate(K.user(entry.uid), (u) => {
    u.applied ||= []
    u.recent ||= {}
    if (u.applied.includes(gid)) {
      outcome = u.recent[gid] || null
      return SKIP
    }
    const valid = !!state.results?.valid && mod.xp !== false
    const finished = !state.players[entry.uid]?.left
    const prev = u.streak || { count: 0, last: null }
    let streak = prev.count || 0
    if (valid) {
      if (prev.last === today) streak = Math.max(1, prev.count)
      else if (prev.last && dayDiff(prev.last, today) === 1) streak = prev.count + 1
      else streak = 1
    }
    const firstGameOfDay = valid && u.lastGameDay !== today
    const xp = computeGameXp({ valid, finished, points: entry.score, rank: entry.rank, firstGameOfDay, streak })
    const levelBefore = levelFromXp(u.xp || 0).level
    u.xp = (u.xp || 0) + xp.total
    const levelAfter = levelFromXp(u.xp).level
    u.level = levelAfter
    u.stats ||= { games: 0, wins: 0, msgs: 0, found: 0, drawn: 0 }
    u.badges ||= {}
    const badges = []
    if (valid) {
      u.streak = { count: streak, last: today }
      u.lastGameDay = today
      if (finished) u.stats.games = (u.stats.games || 0) + 1
      if (entry.rank === 1) u.stats.wins = (u.stats.wins || 0) + 1
      u.stats.found = (u.stats.found || 0) + (entry.found || 0)
      u.stats.drawn = (u.stats.drawn || 0) + (mod.drawnCount?.(state, entry.uid) || 0)
      const earned = [...mod.badgesFor(state, entry.uid)]
      if (u.stats.games >= 1) earned.push('premiere_patte')
      if (u.stats.wins >= 10) earned.push('chef_de_meute')
      if (u.stats.games >= 50) earned.push('marathonien')
      if (streak >= 7) earned.push('fidele')
      for (const id of earned) {
        if (!u.badges[id]) {
          u.badges[id] = endedAt
          badges.push(id)
        }
      }
    }
    const accessories = ACCESSORIES.filter((a) => a.level > levelBefore && a.level <= levelAfter).map((a) => a.id)
    outcome = { xp: xp.total, lines: xp.lines, levelBefore, levelAfter, xpAfter: u.xp, badges, accessories, streak, valid, rank: entry.rank }
    u.applied = [...u.applied, gid].slice(-60)
    const recent = { ...u.recent, [gid]: outcome }
    const keys = Object.keys(recent)
    for (const k of keys.slice(0, Math.max(0, keys.length - 6))) delete recent[k]
    u.recent = recent
  })
  if (!res.changed && !outcome) outcome = res.value?.recent?.[gid] || null
  return outcome
}

async function addToLeaderboard(db, key, gid, gains) {
  await db.mutate(
    key,
    (lb) => {
      lb.xp ||= {}
      lb.applied ||= []
      if (lb.applied.includes(gid)) return SKIP
      for (const [uid, xp] of Object.entries(gains)) if (xp > 0) lb.xp[uid] = (lb.xp[uid] || 0) + xp
      lb.applied = [...lb.applied, gid].slice(-300)
    },
    { create: () => ({ xp: {}, applied: [] }) },
  )
}

/** Carte de résultats publiée dans le salon (identifiant déterministe : publiée une seule fois). */
async function postResults(db, state) {
  const podium = state.results.ranking.slice(0, 3).map((r) => {
    const p = state.players[r.uid] || {}
    return { uid: r.uid, rank: r.rank, score: r.score, pseudo: p.pseudo, coat: p.coat, acc: p.acc || [] }
  })
  const id = makeMsgId(state.endedAt, 'sys', state.id.slice(-6))
  await postMessage(db, state.rid, {
    id,
    ts: state.endedAt,
    author: 'sys',
    type: 'game',
    kind: 'results',
    gid: state.id,
    gtype: state.type,
    podium,
    drawings: state.results.drawings || [],
  })
}

/**
 * Effets de fin de partie, rejouables sans risque : récompenses, classements,
 * carte de résultats, libération du salon. Une fenêtre de 20 s évite les doublons simultanés.
 */
export async function finishSideEffects(db, state, mod) {
  if (state.rewardsDone) return
  const claimWindow = Math.floor((Date.now() - (state.endedAt || Date.now())) / 20000)
  const claimed = await db.create(K.fx(state.id, claimWindow), { at: Date.now() })
  if (!claimed) return
  const rewards = {}
  if (state.status === 'finished' && state.results) {
    const ranking = state.results.ranking || []
    await pMap(ranking, async (entry) => {
      rewards[entry.uid] = await applyPlayerRewards(db, state, entry, mod)
    }, 4)
    const gains = Object.fromEntries(Object.entries(rewards).map(([uid, o]) => [uid, o?.xp || 0]))
    if (Object.values(gains).some((x) => x > 0)) {
      await Promise.all([
        addToLeaderboard(db, K.lbWeek(state.rid, parisWeek(state.endedAt)), state.id, gains),
        addToLeaderboard(db, K.lbAll(state.rid), state.id, gains),
      ])
    }
    await postResults(db, state)
  }
  await db
    .mutate(K.room(state.rid), (r) => {
      if (r.game?.id !== state.id) return SKIP
      r.game = null
      r.lastGame = { id: state.id, type: state.type, status: state.status, at: state.endedAt }
    })
    .catch(() => {})
  await db.mutate(K.game(state.id), (s) => {
    if (s.rewardsDone) return SKIP
    s.rewards = rewards
    s.rewardsDone = true
    s.v = (s.v || 0) + 1
  })
}

/** Classement du salon : semaine en cours (lundi → dimanche, heure de Paris) ou depuis toujours. */
export async function leaderboard(db, rid, scope, now = Date.now()) {
  const week = parisWeek(now)
  const doc = await db.get(scope === 'all' ? K.lbAll(rid) : K.lbWeek(rid, week))
  const entries = Object.entries(doc?.xp || {})
    .map(([uid, xp]) => ({ uid, xp }))
    .sort((a, b) => b.xp - a.xp)
  let rank = 0
  return {
    scope: scope === 'all' ? 'all' : 'week',
    week,
    label: weekLabel(week),
    entries: entries.map((e, i) => {
      if (i === 0 || entries[i - 1].xp !== e.xp) rank = i + 1
      return { ...e, rank }
    }),
  }
}

/** Chaque lundi : message système avec le podium de la semaine écoulée (une seule fois). */
export async function weeklyPodium(db, rid, now = Date.now()) {
  const week = previousWeek(parisWeek(now))
  const room = await db.get(K.room(rid))
  if (!room || (room.podiumDone && room.podiumDone >= week)) return false
  const claimed = await db.create(K.weekly(rid, week), { at: now })
  if (claimed) {
    const doc = await db.get(K.lbWeek(rid, week))
    const top = Object.entries(doc?.xp || {})
      .filter(([, xp]) => xp > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    if (top.length) {
      const users = await Promise.all(top.map(([uid]) => db.get(K.user(uid))))
      const podium = top.map(([uid, xp], i) => ({ uid, xp, pseudo: users[i]?.pseudo || 'Shiba' }))
      await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'weekly', week, label: weekLabel(week), podium } })
    }
  }
  await db
    .mutate(K.room(rid), (r) => {
      if (r.podiumDone && r.podiumDone >= week) return SKIP
      r.podiumDone = week
    })
    .catch(() => {})
  return claimed
}

// ---------- Jeux dans la conversation ----------

/** XP d'un jeu de conversation : 10 jeux par jour au plus rapportent de l'XP (pas de farming). */
export async function applyAsyncRewards(db, state, uid, won) {
  const endedAt = state.endedAt || Date.now()
  const today = parisDay(endedAt)
  let outcome = null
  const res = await db.mutate(K.user(uid), (u) => {
    u.applied ||= []
    u.recent ||= {}
    if (u.applied.includes(state.id)) {
      outcome = u.recent[state.id] || null
      return SKIP
    }
    const day = u.asyncDay?.day === today ? u.asyncDay : { day: today, count: 0 }
    const counts = day.count < 10
    day.count += 1
    u.asyncDay = day
    const prev = u.streak || { count: 0, last: null }
    let streak = prev.count || 0
    if (counts) {
      if (prev.last === today) streak = Math.max(1, prev.count)
      else if (prev.last && dayDiff(prev.last, today) === 1) streak = prev.count + 1
      else streak = 1
    }
    const firstGameOfDay = counts && u.lastGameDay !== today
    const xp = computeAsyncXp({ played: counts, won, firstGameOfDay, streak })
    const levelBefore = levelFromXp(u.xp || 0).level
    u.xp = (u.xp || 0) + xp.total
    const levelAfter = levelFromXp(u.xp).level
    u.level = levelAfter
    u.stats ||= { games: 0, wins: 0, msgs: 0, found: 0, drawn: 0 }
    u.badges ||= {}
    const badges = []
    if (counts) {
      u.streak = { count: streak, last: today }
      u.lastGameDay = today
      u.stats.games = (u.stats.games || 0) + 1
      if (won) u.stats.wins = (u.stats.wins || 0) + 1
      const earned = []
      if (u.stats.games >= 1) earned.push('premiere_patte')
      if (u.stats.wins >= 10) earned.push('chef_de_meute')
      if (u.stats.games >= 50) earned.push('marathonien')
      if (streak >= 7) earned.push('fidele')
      for (const id of earned) if (!u.badges[id]) {
        u.badges[id] = endedAt
        badges.push(id)
      }
    }
    const accessories = ACCESSORIES.filter((a) => a.level > levelBefore && a.level <= levelAfter).map((a) => a.id)
    outcome = { xp: xp.total, lines: xp.lines, levelBefore, levelAfter, xpAfter: u.xp, badges, accessories, streak, valid: counts }
    u.applied = [...u.applied, state.id].slice(-60)
    const recent = { ...u.recent, [state.id]: outcome }
    const keys = Object.keys(recent)
    for (const k of keys.slice(0, Math.max(0, keys.length - 6))) delete recent[k]
    u.recent = recent
  })
  if (!res.changed && !outcome) outcome = res.value?.recent?.[state.id] || null
  return outcome
}

export async function addAsyncToLeaderboards(db, state, gains) {
  const at = state.endedAt || Date.now()
  await Promise.all([addToLeaderboard(db, K.lbWeek(state.rid, parisWeek(at)), state.id, gains), addToLeaderboard(db, K.lbAll(state.rid), state.id, gains)])
}
