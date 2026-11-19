// Moteur commun des jeux en temps réel « par manches » : question → réponses → révélation.
// Chaque réponse est une clé neuve (gx/{partie}/{manche}/a/{joueur}) ; la fin de manche est une
// transition conditionnelle déclenchée par la première interrogation après l'échéance.
import { K } from '../keys.js'
import { fail, ensure, str, int } from '../http.js'
import { activeIds, isPresent, ABSENT_MS } from './common.js'
import { rankPlayers } from '../../shared/scoring.js'
import { LIMITS } from '../../shared/constants.js'

export const REVEAL_MS = 6000
/** Après une mauvaise réponse dans une course : courte pause (pas d'essais au hasard en rafale). */
export const WRONG_COOLDOWN_MS = 1200

function eligible(state) {
  const g = state.g
  return activeIds(state).filter((uid) => (state.players[uid].fromRound || 0) <= g.round)
}

/**
 * @param {object} def
 * @param {string} def.id
 * @param {'single'|'race'} def.mode         une réponse par joueur, ou course jusqu'à la bonne réponse
 * @param {number[]} def.roundChoices         nombres de manches proposés
 * @param {number} def.defaultRounds
 * @param {(settings) => number} def.answerMs temps de réponse
 * @param {number} [def.graceMs]              réponses encore acceptées après l'échéance (envoi automatique)
 * @param {(state, index, now) => {prompt:object, secret:object}} def.makeRound
 * @param {(state, round, value, now) => any} [def.parse]          valeur d'une réponse (mode single)
 * @param {(state, round, value) => boolean} [def.check]           bonne réponse ? (mode race)
 * @param {(state, round, answers) => {points:object, detail:object}} def.score
 * @param {(state, round, now) => object} [def.publicPrompt]       vue de la question (indices dans le temps…)
 * @param {(state, uid, answer, now) => object|null} [def.afterAnswer] effet d'une réponse (ex. « Stop ! »)
 */
export function roundGame(def) {
  const mod = {
    id: def.id,
    kind: 'sync',
    minPlayers: def.minPlayers ?? 2,
    maxPlayers: def.maxPlayers ?? 8,
    xp: true,
    needsFounds: false,
    needsAnswers: true,
    needsVotes: !!def.votes,
    voteView: def.votes ? (state, votes, uid) => def.votes.view(state, state.g, votes, uid) : null,
    /** Règles propres au jeu (lecture d'une réponse, vérification), exposées pour les tests. */
    rules: def,

    defaultSettings: (ctx = {}) => ({ rounds: def.defaultRounds, lang: ctx.lang === 'en' ? 'en' : 'fr', ...(def.extraDefaults || {}) }),
    sanitizeSettings(input = {}, base = mod.defaultSettings()) {
      const s = { ...base }
      if (input.rounds !== undefined) s.rounds = def.roundChoices.includes(int(input.rounds)) ? int(input.rounds) : base.rounds
      if (input.lang !== undefined) s.lang = input.lang === 'en' ? 'en' : input.lang === 'fr' ? 'fr' : base.lang
      def.sanitizeExtra?.(s, input, base)
      return s
    },
    estimate: (s) => Math.round((s.rounds * (def.answerMs(s) + (def.revealMs ?? REVEAL_MS) + 800)) / 1000),

    roundIndex: (state) => (state.g ? state.g.round : -1),
    watchUid: () => null,
    needsFullFacts(state, now, facts) {
      const g = state.g
      if (!g) return true
      if (now >= g.phaseEnd + (g.phase === 'question' ? def.graceMs || 0 : 0)) return true
      if (g.phase === 'question') {
        const el = eligible(state)
        if (el.length && facts.answerIds.length >= el.length) return true
      }
      return false
    },

    start(state, now) {
      for (const uid of activeIds(state)) {
        state.scores[uid] = 0
        state.found[uid] = 0
      }
      state.g = { round: -1, total: state.settings.rounds, phase: null, phaseStart: now, phaseEnd: now, cur: null, used: [], history: [], played: 0 }
      nextRound(state, now)
    },

    tick(state, now, facts, api) {
      const g = state.g
      if (!g) return false
      if (g.phase === 'question') {
        const el = eligible(state)
        const answered = new Set(facts.answerIds)
        const allIn =
          el.length > 0 && el.every((u) => answered.has(u) || (facts.hbLoaded && !isPresent(state, facts, u, now, ABSENT_MS)))
        const over = now >= g.phaseEnd + (def.graceMs || 0)
        if ((over || (allIn && answered.size > 0)) && facts.answers) {
          endRound(state, now, facts)
          return true
        }
        return false
      }
      if (g.phase === 'reveal' && now >= g.phaseEnd) {
        // Petit Bac : les réponses contestées par la majorité sont retirées avant la manche suivante.
        if (def.votes) {
          if (!facts.votes) return false
          def.votes.settle(state, g, facts.votes)
        }
        if (g.round + 1 >= g.total) {
          api.endGame(state, now, 'complete')
          return true
        }
        nextRound(state, now)
        return true
      }
      return false
    },

    onLateJoin(state, uid) {
      state.players[uid].fromRound = (state.g?.round ?? -1) + 1
      state.scores[uid] ||= 0
      state.found[uid] ||= 0
    },
    onLeave() {},

    view(state, uid, now) {
      const g = state.g
      if (!g) return null
      const v = { round: g.round, total: g.total, phase: g.phase, phaseStart: g.phaseStart, phaseEnd: g.phaseEnd, history: g.history, stoppedBy: g.stoppedBy || null }
      if (g.cur) {
        v.prompt = def.publicPrompt ? def.publicPrompt(state, g.cur, now) : g.cur.prompt
        if (g.phase === 'reveal') v.reveal = g.lastReveal
      }
      return v
    },

    finalize(state) {
      const ranking = rankPlayers(state.joinOrder.filter((u) => state.players[u]).map((u) => ({ uid: u, score: state.scores[u] || 0, found: state.found[u] || 0 })))
      const played = state.g?.played || 0
      return { ranking, valid: played >= 3, played, drawings: [] }
    },
    badgesFor: (state, uid) => def.badgesFor?.(state, uid) || [],
    drawnCount: () => 0,

    async act(ctx) {
      const { db, auth, gid, body, now, advance, transition } = ctx
      const state = ctx.state
      const g = state.g
      if (str(body.type, 20) === 'vote') {
        ensure(def.votes, 400, 'action', 'Action inconnue.')
        ensure(state.status === 'playing' && g?.phase === 'reveal' && int(body.round, -1) === g.round && now < g.phaseEnd, 409, 'round_over', 'La vérification est terminée.')
        const voter = state.players[auth.uid]
        ensure(voter && !voter.left, 403, 'not_player', 'Tu ne joues pas dans cette partie.')
        const targets = def.votes.sanitize(state, g, auth.uid, body.targets)
        await db.put(K.vote(gid, g.round, auth.uid), { uid: auth.uid, targets, at: now })
        return { ok: true, targets }
      }
      ensure(str(body.type, 20) === 'answer', 400, 'action', 'Action inconnue.')
      ensure(state.status === 'playing' && g?.phase === 'question', 409, 'round_over', 'Cette manche est terminée.')
      ensure(int(body.round, -1) === g.round, 409, 'round_over', 'Cette manche est terminée.')
      ensure(now <= g.phaseEnd + (def.graceMs || 0), 409, 'round_over', 'Le temps est écoulé !')
      const p = state.players[auth.uid]
      ensure(p && !p.left, 403, 'not_player', 'Tu ne joues pas dans cette partie.')
      ensure((p.fromRound || 0) <= g.round, 409, 'late', 'Tu joues dès la manche suivante.')
      const key = K.answer(gid, g.round, auth.uid)

      if (def.mode === 'race') {
        const tk = K.raceThrottle(gid, auth.uid)
        const th = await db.get(tk)
        if (th?.lg && now - th.lg < 450) fail(429, 'too_fast', 'Pas si vite !', { retryAfterMs: 450 - (now - th.lg) })
        if (th?.lw && now - th.lw < WRONG_COOLDOWN_MS) fail(429, 'too_fast', 'Pas si vite !', { retryAfterMs: WRONG_COOLDOWN_MS - (now - th.lw) })
        const already = await db.get(key)
        ensure(!already, 409, 'already_found', 'Tu as déjà trouvé !')
        const ok = def.check(state, g.cur, body.value)
        db.put(tk, { lg: now, lw: ok ? th?.lw || 0 : now }).catch(() => {})
        if (!ok) return { result: 'wrong', retryAfterMs: WRONG_COOLDOWN_MS }
        const created = await db.create(key, { uid: auth.uid, at: now, ok: true })
        ensure(created, 409, 'already_found', 'Tu as déjà trouvé !')
        const count = (await db.keys(`${K.roundPrefix(gid, g.round)}a/`)).length
        if (count >= eligible(state).length) await advance({ full: true })
        return { result: 'correct', rank: count }
      }

      const value = def.parse(state, g.cur, body.value, now)
      const created = await db.create(key, { uid: auth.uid, at: now, value })
      ensure(created, 409, 'already_answered', 'Tu as déjà répondu à cette manche.')
      if (def.afterAnswer) {
        const effect = def.afterAnswer(state, auth.uid, value, now)
        if (effect?.stop) {
          await transition((s) => {
            const sg = s.g
            if (s.status !== 'playing' || sg.phase !== 'question' || sg.round !== g.round) return false
            const limit = now + effect.stop
            if (sg.phaseEnd <= limit) return false
            sg.phaseEnd = limit
            sg.stoppedBy = auth.uid
            return true
          })
        }
      }
      const count = (await db.keys(`${K.roundPrefix(gid, g.round)}a/`)).length
      if (count >= eligible(state).length) await advance({ full: true })
      return { result: 'answered', value }
    },
    async strokes() {
      fail(400, 'action', 'Action inconnue.')
    },
  }

  function nextRound(state, now) {
    const g = state.g
    g.round += 1
    const made = def.makeRound(state, g.round, now)
    g.cur = { index: g.round, prompt: made.prompt, secret: made.secret }
    g.phase = 'question'
    g.phaseStart = now
    g.phaseEnd = now + def.answerMs(state.settings, g.cur)
    g.stoppedBy = null
    if (made.used) g.used.push(...made.used)
  }

  function endRound(state, now, facts) {
    const g = state.g
    const answers = (facts.answers || []).filter((a) => a && state.players[a.uid]).sort((a, b) => a.at - b.at)
    const { points, detail } = def.score(state, g.cur, answers)
    for (const [uid, pts] of Object.entries(points)) state.scores[uid] = (state.scores[uid] || 0) + pts
    for (const [uid, d] of Object.entries(detail || {})) if (d?.ok) state.found[uid] = (state.found[uid] || 0) + 1
    const reveal = { index: g.round, prompt: g.cur.prompt, secret: g.cur.secret, points, detail }
    g.lastReveal = reveal
    g.history.push({ index: g.round, points })
    g.played = (g.played || 0) + 1
    g.phase = 'reveal'
    g.phaseStart = now
    g.phaseEnd = now + (def.revealMs ?? REVEAL_MS)
  }

  return mod
}

/** Points par ordre d'arrivée (courses) : 100, 80, 60, puis 40. */
export function racePoints(rank) {
  return [100, 80, 60][rank] ?? 40
}

export { eligible, LIMITS }
