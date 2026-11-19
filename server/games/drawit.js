// Draw It : un joueur dessine un mot, les autres le devinent le plus vite possible.
// Le serveur fait foi : le mot n'est jamais envoyé aux devineurs avant la fin de la manche.
import bankFr from '../../data/mots.json' with { type: 'json' }
import bankEn from '../../data/words-en.json' with { type: 'json' }
import { K } from '../keys.js'
import { fail, ensure, str, int } from '../http.js'
import { activeIds, isPresent, shuffle, randomInt, ABSENT_MS, ACTIVE_MS } from './common.js'
import { DRAWIT, THEME_IDS, defaultTours, drawItDuration, LIMITS, CANVAS_W, CANVAS_H, DRAW_COLORS, BRUSHES } from '../../shared/constants.js'
import { judgeGuess, cleanLine, validateCustomWord, hintPattern } from '../../shared/text.js'
import { containsBanned } from '../../shared/moderation.js'
import { roundPoints, rankPlayers, guesserPoints, multiplierFor, FIRST_FINDER_BONUS, MULTIPLIERS, DIFFICULTIES } from '../../shared/scoring.js'
import { MIN_ROUNDS_FOR_XP } from '../../shared/progression.js'
import { randomString, LOWER_ALPHABET } from '../../shared/ids.js'

function parseEntry(entry, difficulty, theme) {
  const answers = String(entry).split('|').map((s) => s.trim()).filter(Boolean)
  return { display: answers[0], answers, difficulty, theme, custom: false }
}

const bankFor = (lang) => (lang === 'en' ? bankEn : bankFr)

function poolFor(themes, difficulty, lang) {
  const bank = bankFor(lang)
  return themes.flatMap((t) => (bank.themes[t]?.[difficulty] || []).map((e) => parseEntry(e, difficulty, t)))
}

/** Trois mots, un par difficulté ; un mot proposé ne revient pas dans la même partie. */
function pickChoices(state) {
  const g = state.g
  const themes = state.settings.themes === 'all' ? THEME_IDS : state.settings.themes
  const used = new Set(g.used)
  const lang = state.settings.lang
  const out = []
  for (const diff of DIFFICULTIES) {
    let pool = poolFor(themes, diff, lang).filter((w) => !used.has(w.display))
    if (!pool.length) pool = poolFor(THEME_IDS, diff, lang).filter((w) => !used.has(w.display))
    if (!pool.length) pool = poolFor(THEME_IDS, diff, lang)
    const pick = pool[randomInt(pool.length)]
    used.add(pick.display)
    out.push(pick)
  }
  g.used = [...used]
  return out
}

function eligibleGuessers(state) {
  const g = state.g
  return activeIds(state).filter((uid) => uid !== g.drawerId && (state.players[uid].fromRound || 0) <= g.round)
}

function drawerUnreachable(state, facts, now) {
  const g = state.g
  return now - g.phaseStart > ABSENT_MS && !isPresent(state, facts, g.drawerId, now, ABSENT_MS)
}

function beginRound(state, now, uid) {
  const g = state.g
  g.round += 1
  g.drawerId = uid
  g.phase = 'choosing'
  g.phaseStart = now
  g.phaseEnd = now + DRAWIT.chooseMs
  g.word = null
  g.hintSlots = []
  g.rerolled = false
  g.choices = pickChoices(state)
}

function startDrawing(state, now, word) {
  const g = state.g
  g.word = word
  g.choices = null
  g.phase = 'drawing'
  g.phaseStart = now
  g.phaseEnd = now + g.drawMs
  const pattern = hintPattern(word.display).filter((p) => p.t === 'l')
  g.hintSlots = []
  if (pattern.length >= 5) {
    const idx = shuffle(pattern.map((p) => p.i))
    g.hintSlots = idx.slice(0, 2)
  }
}

/** Fin de manche : calcul des points à partir des bonnes réponses enregistrées. */
function endRound(state, now, reason, facts) {
  const g = state.g
  const hadWord = !!g.word
  const founds = (facts.founds || []).filter((f) => f && state.players[f.uid] && f.uid !== g.drawerId).sort((a, b) => a.at - b.at)
  const firstId = hadWord ? facts.first?.uid || founds[0]?.uid || null : null
  let points = {}
  if (hadWord) {
    const elig = eligibleGuessers(state)
    const foundSet = new Set(founds.map((f) => f.uid))
    const counted = elig.filter((u) => foundSet.has(u) || !facts.hbLoaded || isPresent(state, facts, u, now, ACTIVE_MS))
    const guesserCount = Math.max(counted.length, founds.length)
    points = roundPoints({
      finds: founds.map((f) => ({ uid: f.uid, at: f.at })),
      firstId,
      drawerId: g.drawerId,
      guesserCount,
      drawStart: g.phaseStart,
      drawMs: g.drawMs,
      difficulty: g.word.difficulty,
      drawerScores: reason !== 'skip' && reason !== 'left',
    })
    for (const [uid, pts] of Object.entries(points)) state.scores[uid] = (state.scores[uid] || 0) + pts
    for (const f of founds) state.found[f.uid] = (state.found[f.uid] || 0) + 1
    g.facts ||= {}
    const fx = (uid) => (g.facts[uid] ||= { fast: false, picasso: false, maison: false, asGuesser: 0, foundAsGuesser: 0, drawn: 0 })
    for (const f of founds) if (f.at - g.phaseStart < 5000) fx(f.uid).fast = true
    const everyone = counted.length > 0 && counted.every((u) => foundSet.has(u))
    if (everyone && reason !== 'left') {
      fx(g.drawerId).picasso = true
      if (g.word.custom) fx(g.drawerId).maison = true
    }
    for (const u of counted) {
      fx(u).asGuesser++
      if (foundSet.has(u)) fx(u).foundAsGuesser++
    }
    fx(g.drawerId).drawn++
    g.played = (g.played || 0) + 1
  }
  const round = {
    i: g.round,
    tour: g.tour,
    drawerId: g.drawerId,
    word: hadWord ? g.word.display : null,
    difficulty: hadWord ? g.word.difficulty : null,
    custom: hadWord ? !!g.word.custom : false,
    reason,
    points,
    foundIds: founds.map((f) => f.uid),
    firstId,
    at: now,
  }
  g.rounds.push(round)
  g.last = round
  g.word = null
  g.choices = null
  g.hintSlots = []
  g.phase = 'reveal'
  g.phaseStart = now
  g.phaseEnd = now + (hadWord ? DRAWIT.revealMs : DRAWIT.revealShortMs)
}

/** Dessinateur suivant (ordre tiré au lancement, absents sautés) ou fin de partie. */
function nextTurn(state, now, facts, api) {
  const g = state.g
  const present = activeIds(state).filter((u) => isPresent(state, facts, u, now, ACTIVE_MS))
  if (present.length < DRAWIT.minPlayers) return api.endGame(state, now, 'not_enough')
  const guard = g.order.length * (g.tours + 1) + 2
  for (let n = 0; n < guard; n++) {
    let pos = g.pos + 1
    let tour = g.tour
    if (pos >= g.order.length) {
      pos = 0
      tour += 1
    }
    g.pos = pos
    g.tour = tour
    if (tour > g.tours) return api.endGame(state, now, 'complete')
    const uid = g.order[pos]
    const p = state.players[uid]
    if (!p || p.left) continue
    if (!isPresent(state, facts, uid, now, ABSENT_MS)) continue
    return beginRound(state, now, uid)
  }
  return api.endGame(state, now, 'complete')
}

function publicRound(r) {
  return r && { ...r }
}

function hintView(g, now) {
  const chars = Array.from(g.word.display)
  const elapsed = (now - g.phaseStart) / g.drawMs
  const shown = new Set()
  if (g.hintSlots[0] !== undefined && elapsed >= 0.5) shown.add(g.hintSlots[0])
  if (g.hintSlots[1] !== undefined && elapsed >= 0.75) shown.add(g.hintSlots[1])
  const cells = hintPattern(g.word.display).map((p) => (p.t === 'l' && shown.has(p.i) ? { t: 'l', c: chars[p.i].toLocaleUpperCase('fr') } : { t: p.t }))
  let nextHintAt = null
  if (g.hintSlots.length && elapsed < 0.5) nextHintAt = g.phaseStart + g.drawMs * 0.5
  else if (g.hintSlots.length > 1 && elapsed < 0.75) nextHintAt = g.phaseStart + g.drawMs * 0.75
  return { cells, nextHintAt }
}

function sanitizeSettings(input = {}, base = drawit.defaultSettings()) {
  const s = { ...base }
  if (input.tours !== undefined) s.tours = input.tours === 'auto' ? 'auto' : DRAWIT.tourChoices.includes(int(input.tours)) ? int(input.tours) : base.tours
  if (input.drawTime !== undefined) s.drawTime = DRAWIT.drawTimes.includes(int(input.drawTime)) ? int(input.drawTime) : base.drawTime
  if (input.custom !== undefined) s.custom = !!input.custom
  if (input.lang !== undefined) s.lang = input.lang === 'en' ? 'en' : input.lang === 'fr' ? 'fr' : base.lang || 'fr'
  if (input.themes !== undefined) {
    if (input.themes === 'all') s.themes = 'all'
    else if (Array.isArray(input.themes)) {
      const list = THEME_IDS.filter((t) => input.themes.includes(t))
      s.themes = list.length === 0 || list.length === THEME_IDS.length ? 'all' : list
    }
  }
  return s
}

function validOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 120) return false
  for (const op of ops) {
    if (!op || typeof op !== 'object') return false
    if (op.k === 'c') continue
    if (op.k === 'u') {
      if (!Number.isInteger(op.i) || op.i < 0) return false
      continue
    }
    if (op.k !== 'p') return false
    if (!Number.isInteger(op.i) || op.i < 0 || op.i > 1e6) return false
    if (!Number.isInteger(op.c) || op.c < 0 || op.c > DRAW_COLORS.length) return false
    if (!Number.isInteger(op.w) || op.w < 0 || op.w >= BRUSHES.length) return false
    if (!Array.isArray(op.p) || op.p.length < 2 || op.p.length > 1200 || op.p.length % 2) return false
    for (let j = 0; j < op.p.length; j += 2) {
      const x = op.p[j]
      const y = op.p[j + 1]
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < -20 || y < -20 || x > CANVAS_W + 20 || y > CANVAS_H + 20) return false
    }
  }
  return true
}

const guessId = (now, uid, kind) => `${String(now).padStart(13, '0')}_${uid}_${kind}_${randomString(4, LOWER_ALPHABET)}`

const drawit = {
  id: 'drawit',
  name: 'Draw It',
  minPlayers: DRAWIT.minPlayers,
  maxPlayers: DRAWIT.maxPlayers,
  xp: true,
  needsFounds: true,

  kind: 'sync',
  defaultSettings: (ctx = {}) => ({ tours: 'auto', drawTime: DRAWIT.defaultDrawTime, custom: true, themes: 'all', lang: ctx.lang === 'en' ? 'en' : 'fr' }),
  sanitizeSettings,
  estimate: (settings, n) => drawItDuration(settings, n),

  roundIndex: (state) => (state.g ? state.g.round : -1),
  /** Joueur dont on surveille la présence à chaque interrogation (le dessinateur). */
  watchUid: (state) => (state.g && (state.g.phase === 'choosing' || state.g.phase === 'drawing') ? state.g.drawerId : null),

  /** Faut-il charger toute la présence et les bonnes réponses (une transition est possible) ? */
  needsFullFacts(state, now, facts) {
    const g = state.g
    if (!g || now >= g.phaseEnd) return true
    if (g.phase === 'choosing' || g.phase === 'drawing') {
      if (state.players[g.drawerId]?.left) return true
      if (drawerUnreachable(state, facts, now)) return true
    }
    if (g.phase === 'drawing') {
      const elig = eligibleGuessers(state)
      if (elig.length && facts.foundIds.length >= elig.length) return true
    }
    return false
  },

  start(state, now, facts, api) {
    const ids = activeIds(state)
    const tours = state.settings.tours === 'auto' ? defaultTours(ids.length) : state.settings.tours
    state.g = {
      tours,
      drawMs: state.settings.drawTime * 1000,
      order: shuffle(ids),
      tour: 1,
      pos: -1,
      round: -1,
      phase: null,
      phaseStart: now,
      phaseEnd: now,
      drawerId: null,
      choices: null,
      word: null,
      hintSlots: [],
      used: [],
      rounds: [],
      last: null,
      facts: {},
      played: 0,
    }
    for (const uid of ids) {
      state.scores[uid] = 0
      state.found[uid] = 0
    }
    nextTurn(state, now, facts, api)
  },

  tick(state, now, facts, api) {
    const g = state.g
    if (!g) return false
    const drawerGone = state.players[g.drawerId]?.left
    if (g.phase === 'choosing') {
      if (drawerGone || drawerUnreachable(state, facts, now)) {
        endRound(state, now, 'left', facts)
        return true
      }
      if (now >= g.phaseEnd) {
        startDrawing(state, now, g.choices[0])
        return true
      }
      return false
    }
    if (g.phase === 'drawing') {
      if (drawerGone || drawerUnreachable(state, facts, now)) {
        endRound(state, now, 'left', facts)
        return true
      }
      if (now >= g.phaseEnd) {
        endRound(state, now, 'time', facts)
        return true
      }
      const elig = eligibleGuessers(state)
      const found = new Set(facts.foundIds)
      const remaining = elig.filter((u) => !found.has(u))
      if (elig.length && found.size > 0) {
        const allDone = remaining.length === 0 || (facts.hbLoaded && remaining.every((u) => !isPresent(state, facts, u, now, ABSENT_MS)))
        if (allDone && facts.founds) {
          endRound(state, now, 'found', facts)
          return true
        }
      }
      return false
    }
    if (g.phase === 'reveal' && now >= g.phaseEnd) {
      nextTurn(state, now, facts, api)
      return true
    }
    return false
  },

  onLateJoin(state, uid) {
    const g = state.g
    state.players[uid].fromRound = g.round + 1
    if (!g.order.includes(uid)) g.order.push(uid)
    state.scores[uid] ||= 0
    state.found[uid] ||= 0
  },

  onLeave(state, uid, now, facts) {
    const g = state.g
    if (g && g.drawerId === uid && (g.phase === 'choosing' || g.phase === 'drawing')) endRound(state, now, 'left', facts)
  },

  view(state, uid, now) {
    const g = state.g
    if (!g) return null
    const isDrawer = g.drawerId === uid
    const v = {
      tours: g.tours,
      tour: g.tour,
      round: g.round,
      played: g.played || 0,
      totalRounds: g.tours * g.order.length,
      order: g.order,
      phase: g.phase,
      phaseStart: g.phaseStart,
      phaseEnd: g.phaseEnd,
      drawerId: g.drawerId,
      drawMs: g.drawMs,
      isDrawer,
      canCustom: !!state.settings.custom,
      rounds: g.rounds.map(publicRound),
    }
    if (state.status !== 'playing') return v
    if (g.phase === 'choosing' && isDrawer && g.choices) {
      v.choices = g.choices.map((c) => ({ word: c.display, difficulty: c.difficulty, mult: MULTIPLIERS[c.difficulty] }))
      v.canReroll = !g.rerolled
    }
    if (g.phase === 'drawing' && g.word) {
      v.difficulty = g.word.difficulty
      v.mult = multiplierFor(g.word.difficulty)
      if (isDrawer) v.word = g.word.display
      else Object.assign(v, { hint: hintView(g, now) })
    }
    if (g.phase === 'reveal') v.last = publicRound(g.last)
    return v
  },

  finalize(state) {
    const g = state.g
    const ranking = rankPlayers(
      state.joinOrder.filter((u) => state.players[u]).map((uid) => ({ uid, score: state.scores[uid] || 0, found: state.found[uid] || 0 })),
    )
    const played = g?.played || 0
    return {
      ranking,
      valid: played >= MIN_ROUNDS_FOR_XP,
      played,
      drawings: (g?.rounds || []).filter((r) => r.word).map((r) => ({ r: r.i, drawerId: r.drawerId, word: r.word })),
    }
  },

  badgesFor(state, uid) {
    const f = state.g?.facts?.[uid]
    if (!f) return []
    const out = []
    if (f.fast) out.push('flair')
    if (f.picasso) out.push('picasshiba')
    if (f.maison) out.push('mot_maison')
    if (f.asGuesser >= 2 && f.foundAsGuesser === f.asGuesser) out.push('sans_faute')
    return out
  },

  drawnCount: (state, uid) => state.g?.facts?.[uid]?.drawn || 0,

  /** Actions des joueurs : choix du mot, mot perso, passer, proposition, traits. */
  async act(ctx) {
    const { db, auth, gid, body, now, transition, advance } = ctx
    const type = str(body.type, 20)

    if (type === 'choose' || type === 'custom') {
      let word = null
      if (type === 'custom') {
        const check = validateCustomWord(str(body.word, 80))
        ensure(check.ok, 400, 'custom_word', check.error)
        ensure(!containsBanned(check.value), 400, 'custom_banned', 'Ce mot n’est pas autorisé. Choisis-en un autre.')
        word = { display: check.value, answers: [check.value], difficulty: 'perso', theme: null, custom: true }
      }
      const index = int(body.index, -1)
      const res = await transition((state) => {
        const g = state.g
        ensure(state.status === 'playing' && g?.phase === 'choosing', 409, 'not_choosing', 'Le choix du mot est terminé.')
        ensure(g.drawerId === auth.uid, 403, 'not_drawer', 'Ce n’est pas à toi de dessiner.')
        ensure(int(body.round, -1) === g.round, 409, 'round_over', 'Cette manche est terminée.')
        if (type === 'custom') ensure(state.settings.custom, 403, 'custom_off', 'Les mots perso sont désactivés pour cette partie.')
        const chosen = word || g.choices[index]
        ensure(chosen, 400, 'choice', 'Choisis un des trois mots.')
        startDrawing(state, now, chosen)
        return true
      })
      return { ok: true, v: res.state.v }
    }

    // Trois autres mots, une fois par tour (avec quelques secondes de plus pour choisir).
    if (type === 'reroll') {
      const res = await transition((state) => {
        const g = state.g
        ensure(state.status === 'playing' && g?.phase === 'choosing', 409, 'not_choosing', 'Le choix du mot est terminé.')
        ensure(g.drawerId === auth.uid, 403, 'not_drawer', 'Ce n’est pas à toi de dessiner.')
        ensure(int(body.round, -1) === g.round, 409, 'round_over', 'Cette manche est terminée.')
        ensure(!g.rerolled, 409, 'reroll_used', 'Tu as déjà demandé d’autres mots.')
        g.rerolled = true
        g.choices = pickChoices(state)
        g.phaseEnd = Math.max(g.phaseEnd, now + 8000)
        return true
      })
      return { ok: true, v: res.state.v }
    }

    if (type === 'skip') {
      const res = await transition(
        (state, facts) => {
          const g = state.g
          ensure(state.status === 'playing' && g?.phase === 'drawing', 409, 'not_drawing', 'Rien à passer pour le moment.')
          ensure(g.drawerId === auth.uid, 403, 'not_drawer', 'Seul le dessinateur peut passer.')
          endRound(state, now, 'skip', facts)
          return true
        },
        { full: true },
      )
      return { ok: true, v: res.state.v }
    }

    if (type === 'guess') {
      const state = ctx.state
      const g = state.g
      ensure(state.status === 'playing' && g?.phase === 'drawing' && g.word, 409, 'not_drawing', 'Ce n’est pas le moment de proposer.')
      ensure(int(body.round, -1) === g.round && now < g.phaseEnd, 409, 'round_over', 'Cette manche est terminée.')
      const p = state.players[auth.uid]
      ensure(p && !p.left, 403, 'not_player', 'Tu ne joues pas dans cette partie.')
      ensure(auth.uid !== g.drawerId, 403, 'drawer', 'Tu dessines : tu ne peux pas proposer.')
      ensure((p.fromRound || 0) <= g.round, 409, 'late', 'Tu joues dès la manche suivante.')
      const text = cleanLine(str(body.text, 200)).slice(0, 60)
      ensure(text, 400, 'empty', 'Écris une proposition.')
      const [hb, already] = await Promise.all([db.get(K.heartbeat(gid, auth.uid)), db.get(K.found(gid, g.round, auth.uid))])
      ensure(!already, 409, 'already_found', 'Tu as déjà trouvé ! Attends la manche suivante.')
      if (hb?.lg && now - hb.lg < LIMITS.guessIntervalMs - 150) {
        fail(429, 'too_fast', 'Une proposition par seconde, pas plus !', { retryAfterMs: LIMITS.guessIntervalMs - (now - hb.lg) })
      }
      const beat = db.put(K.heartbeat(gid, auth.uid), { ts: now, lg: now })
      const verdict = judgeGuess(text, g.word.answers)
      if (verdict === 'correct') {
        const base = guesserPoints(g.phaseEnd - now, g.drawMs)
        const created = await db.create(K.found(gid, g.round, auth.uid), { uid: auth.uid, at: now, base })
        ensure(created, 409, 'already_found', 'Tu as déjà trouvé ! Attends la manche suivante.')
        const first = await db.create(K.first(gid, g.round), { uid: auth.uid, at: now })
        await Promise.all([db.create(K.guess(gid, g.round, guessId(now, auth.uid, 'f')), { uid: auth.uid, k: 'f', at: now }), beat])
        const foundCount = (await db.keys(`${K.roundPrefix(gid, g.round)}f/`)).length
        if (foundCount >= eligibleGuessers(state).length) await advance({ full: true })
        const pts = Math.round((base + (first ? FIRST_FINDER_BONUS : 0)) * multiplierFor(g.word.difficulty))
        return { result: 'correct', points: pts, first }
      }
      const kind = verdict === 'masked' ? 'm' : 'w'
      const entry = kind === 'm' ? { uid: auth.uid, k: 'm', at: now } : { uid: auth.uid, k: 'w', at: now, text }
      await Promise.all([db.create(K.guess(gid, g.round, guessId(now, auth.uid, kind)), entry), beat])
      return { result: verdict, text }
    }

    fail(400, 'action', 'Action inconnue.')
  },

  /** Lot de traits du dessinateur (clé neuve par lot, numéro de séquence par appareil). */
  async strokes(ctx) {
    const { db, auth, gid, body, now, state } = ctx
    const g = state.g
    ensure(state.status === 'playing' && g?.phase === 'drawing', 409, 'not_drawing', 'La manche est terminée.')
    ensure(int(body.round, -1) === g.round, 409, 'round_over', 'La manche est terminée.')
    ensure(g.drawerId === auth.uid, 403, 'not_drawer', 'Ce n’est pas à toi de dessiner.')
    ensure(now <= g.phaseEnd + 3000, 409, 'round_over', 'Le temps est écoulé.')
    const seq = int(body.seq, -1)
    ensure(seq >= 0 && seq < 1e6, 400, 'seq', 'Numéro de lot invalide.')
    ensure(validOps(body.ops), 400, 'ops', 'Traits invalides.')
    const created = await db.create(K.stroke(gid, g.round, auth.dev, seq), { d: auth.dev, s: seq, at: now, ops: body.ops })
    return { ok: true, duplicate: !created }
  },
}

export default drawit
