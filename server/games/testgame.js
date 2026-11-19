// Jeu factice (tests automatisés du cadre commun) : quelques manches courtes,
// chaque joueur qui « tape » pendant une manche marque 10 points. Masqué du hub, sans XP.
import { K } from '../keys.js'
import { ensure, int, str, fail } from '../http.js'
import { activeIds } from './common.js'
import { rankPlayers } from '../../shared/scoring.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const testgame = {
  id: 'test',
  name: 'Jeu test',
  minPlayers: 2,
  maxPlayers: 8,
  xp: false,
  needsFounds: false,

  defaultSettings: () => ({ rounds: 3, roundSec: 3 }),
  sanitizeSettings(input = {}, base = testgame.defaultSettings()) {
    return {
      rounds: input.rounds !== undefined ? clamp(int(input.rounds, base.rounds), 1, 5) : base.rounds,
      roundSec: input.roundSec !== undefined ? clamp(int(input.roundSec, base.roundSec), 2, 20) : base.roundSec,
    }
  },
  estimate: (s) => s.rounds * s.roundSec,
  roundIndex: (state) => (state.g ? state.g.round : -1),
  watchUid: () => null,
  needsFullFacts: (state, now) => !state.g || now >= state.g.phaseEnd,

  start(state, now) {
    for (const uid of activeIds(state)) {
      state.scores[uid] = 0
      state.found[uid] = 0
    }
    state.g = { round: 0, phase: 'round', phaseStart: now, phaseEnd: now + state.settings.roundSec * 1000, rounds: [], played: 0 }
  },

  tick(state, now, facts, api) {
    const g = state.g
    if (!g || now < g.phaseEnd) return false
    const taps = facts.taps || []
    for (const uid of taps) {
      if (!state.players[uid]) continue
      state.scores[uid] = (state.scores[uid] || 0) + 10
      state.found[uid] = (state.found[uid] || 0) + 1
    }
    g.rounds.push({ i: g.round, taps })
    g.played += 1
    if (g.round + 1 >= state.settings.rounds) {
      api.endGame(state, now, 'complete')
      return true
    }
    g.round += 1
    g.phaseStart = now
    g.phaseEnd = now + state.settings.roundSec * 1000
    return true
  },

  onLateJoin(state, uid) {
    state.players[uid].fromRound = (state.g?.round || 0) + 1
  },
  onLeave() {},

  view(state) {
    const g = state.g
    return g && { round: g.round, rounds: state.settings.rounds, phase: g.phase, phaseStart: g.phaseStart, phaseEnd: g.phaseEnd, history: g.rounds }
  },

  finalize(state) {
    const ranking = rankPlayers(state.joinOrder.filter((u) => state.players[u]).map((uid) => ({ uid, score: state.scores[uid] || 0, found: state.found[uid] || 0 })))
    return { ranking, valid: true, played: state.g?.played || 0, drawings: [] }
  },
  badgesFor: () => [],
  drawnCount: () => 0,

  async act(ctx) {
    const { db, auth, gid, body, now, state } = ctx
    ensure(str(body.type, 10) === 'tap', 400, 'action', 'Action inconnue.')
    const g = state.g
    ensure(state.status === 'playing' && g && now < g.phaseEnd, 409, 'round_over', 'Manche terminée.')
    ensure(state.players[auth.uid] && !state.players[auth.uid].left, 403, 'not_player', 'Tu ne joues pas.')
    const created = await db.create(K.tap(gid, g.round, auth.uid), { at: now })
    return { ok: true, created }
  },
  async strokes() {
    fail(400, 'action', 'Action inconnue.')
  },
}

export default testgame
