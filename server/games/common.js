// Outils communs à tous les jeux : joueurs actifs, présence, fin de partie.
import { LIMITS } from '../../shared/constants.js'

export const ABSENT_MS = LIMITS.absentMs // injoignable au-delà de 10 s
export const ACTIVE_MS = 30000 // « actif » pour continuer une partie

/** Joueurs inscrits qui n'ont pas quitté la partie (ordre d'arrivée). */
export function activeIds(state) {
  return state.joinOrder.filter((uid) => state.players[uid] && !state.players[uid].left)
}

/** Dernier signe de vie : battement de cœur, ou arrivée récente dans la partie. */
export function lastSeen(state, facts, uid) {
  return Math.max(facts?.hb?.[uid] || 0, state.players[uid]?.joinedAt || 0, state.players[uid]?.seenAt || 0)
}

export function isPresent(state, facts, uid, now, ms = ABSENT_MS) {
  return now - lastSeen(state, facts, uid) <= ms
}

export function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function randomInt(n) {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] % n
}
