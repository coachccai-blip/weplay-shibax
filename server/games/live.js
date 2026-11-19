// Jeux en temps réel construits sur le moteur « par manches » (server/games/rounds.js).
import quizBank from '../../data/quiz.json' with { type: 'json' }
import estimationBank from '../../data/estimations.json' with { type: 'json' }
import bacBank from '../../data/petitbac.json' with { type: 'json' }
import wordsFr from '../../data/mots.json' with { type: 'json' }
import wordsEn from '../../data/words-en.json' with { type: 'json' }
import { roundGame, racePoints, eligible } from './rounds.js'
import { shuffle, randomInt, activeIds } from './common.js'
import { ensure, str, int } from '../http.js'
import { compactWord, cleanLine, judgeGuess, normalizeWord } from '../../shared/text.js'
import { containsBanned } from '../../shared/moderation.js'
import { LIVE_ROUNDS, QUIZ_CATS } from '../../shared/constants.js'

const loc = (item, lang) => item[lang] || item.fr

function pickUnused(list, used, idOf) {
  const set = new Set(used)
  const pool = list.filter((x) => !set.has(idOf(x)))
  const from = pool.length ? pool : list
  return from[randomInt(from.length)]
}

// ---------- Quiz de la meute : 4 réponses, la vitesse compte, les séries rapportent un bonus ----------

export const quiz = roundGame({
  id: 'quiz',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.quiz.choices,
  defaultRounds: LIVE_ROUNDS.quiz.def,
  answerMs: () => 15000,
  extraDefaults: { cats: 'all' },
  sanitizeExtra(s, input) {
    if (input.cats === undefined) return
    if (input.cats === 'all') s.cats = 'all'
    else if (Array.isArray(input.cats)) {
      const list = [...new Set(input.cats.map(String))].filter((c) => QUIZ_CATS.includes(c))
      s.cats = list.length && list.length < QUIZ_CATS.length ? list : 'all'
    }
  },
  makeRound(state) {
    const cats = Array.isArray(state.settings.cats) ? new Set(state.settings.cats) : null
    const pool = cats ? quizBank.questions.filter((q) => cats.has(q.cat)) : quizBank.questions
    const q = pickUnused(pool.length ? pool : quizBank.questions, state.g.used, (x) => x.id)
    const l = loc(q, state.settings.lang)
    const order = shuffle([0, 1, 2, 3])
    return { prompt: { q: l.q, choices: order.map((i) => l.a[i]), cat: q.cat }, secret: { correct: order.indexOf(0) }, used: [q.id] }
  },
  parse(state, round, value) {
    const i = int(value, -1)
    ensure(i >= 0 && i < 4, 400, 'choice', 'Choisis une des quatre réponses.')
    return i
  },
  score(state, round, answers) {
    const points = {}
    const detail = {}
    const start = state.g.phaseStart
    const combo = (state.g.combo ||= {})
    const answered = new Set(answers.map((a) => a.uid))
    for (const a of answers) {
      const ok = a.value === round.secret.correct
      const remaining = Math.max(0, start + 15000 - a.at)
      combo[a.uid] = ok ? (combo[a.uid] || 0) + 1 : 0
      const streak = combo[a.uid]
      // Bonne réponse : 50 points + jusqu'à 50 pour la vitesse ; série de bonnes réponses : +10 par manche (30 au plus).
      const bonus = ok && streak >= 2 ? Math.min(30, 10 * (streak - 1)) : 0
      points[a.uid] = ok ? Math.round(50 + (50 * remaining) / 15000) + bonus : 0
      detail[a.uid] = { value: a.value, ok, ms: Math.max(0, a.at - start), streak: ok ? streak : 0, bonus }
    }
    for (const uid of Object.keys(combo)) if (!answered.has(uid)) combo[uid] = 0
    return { points, detail }
  },
})

// ---------- Réflexe : le shiba surgit, le plus rapide gagne ; parfois c'est un chat : ne pas toucher ! ----------

const REFLEX_COATS = ['roux', 'creme', 'sesame', 'noir']

export const reflexe = roundGame({
  id: 'reflexe',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.reflexe.choices,
  defaultRounds: LIVE_ROUNDS.reflexe.def,
  answerMs: (settings, cur) => (cur ? cur.prompt.appearIn : 3250) + (cur?.prompt?.decoy ? 2200 : 3000),
  makeRound(state, index, now) {
    const appearIn = 1500 + randomInt(3500)
    // À partir de la deuxième manche, une fois sur quatre environ, c'est un chat qui surgit.
    const decoy = index > 0 && randomInt(4) === 0
    return { prompt: { appearAt: now + appearIn, appearIn, spot: randomInt(5), coat: REFLEX_COATS[randomInt(4)], decoy }, secret: {} }
  },
  parse(state, round, value, now) {
    // Temps mesuré sur l'appareil (équitable quelle que soit la connexion), borné par ce que voit le serveur.
    const elapsed = now - round.prompt.appearAt
    if (value?.early === true || elapsed < -300) return { early: true, ms: null }
    const claimed = Number(value?.ms)
    const ceiling = Math.max(120, elapsed + 300)
    const ms = Number.isFinite(claimed) ? Math.round(Math.min(Math.max(claimed, 120), ceiling)) : Math.max(120, Math.round(elapsed))
    return { early: false, ms }
  },
  score(state, round, answers) {
    const points = {}
    const detail = {}
    if (round.prompt.decoy) {
      // Chat-piège : toucher = 0 point ; garder son sang-froid = 40 points.
      const tapped = new Set()
      for (const a of answers) {
        tapped.add(a.uid)
        points[a.uid] = 0
        detail[a.uid] = a.value.early ? { early: true, ok: false } : { trap: true, ok: false, ms: a.value.ms }
      }
      for (const uid of eligible(state)) {
        if (tapped.has(uid)) continue
        points[uid] = 40
        detail[uid] = { calm: true, ok: true }
      }
      return { points, detail }
    }
    const valid = answers.filter((a) => !a.value.early).sort((x, y) => x.value.ms - y.value.ms)
    valid.forEach((a, i) => {
      points[a.uid] = [100, 75, 50][i] ?? 25
      detail[a.uid] = { ms: a.value.ms, ok: true, rank: i + 1 }
    })
    for (const a of answers) if (a.value.early) {
      points[a.uid] = 0
      detail[a.uid] = { early: true, ok: false }
    }
    return { points, detail }
  },
})

// ---------- Le juste nombre : la réponse la plus proche l'emporte ----------

export const justenombre = roundGame({
  id: 'justenombre',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.justenombre.choices,
  defaultRounds: LIVE_ROUNDS.justenombre.def,
  answerMs: () => 25000,
  makeRound(state) {
    const q = pickUnused(estimationBank.questions, state.g.used, (x) => x.id)
    const l = loc(q, state.settings.lang)
    return { prompt: { q: l.q, unit: l.unit || '' }, secret: { answer: q.answer }, used: [q.id] }
  },
  parse(state, round, value) {
    const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'))
    ensure(Number.isFinite(n) && n >= 0 && n < 1e12, 400, 'number', 'Entre un nombre.')
    return Math.round(n * 100) / 100
  },
  score(state, round, answers) {
    const target = round.secret.answer
    const sorted = answers.map((a) => ({ ...a, dist: Math.abs(a.value - target) })).sort((x, y) => x.dist - y.dist)
    const points = {}
    const detail = {}
    let rank = 0
    sorted.forEach((a, i) => {
      if (i === 0 || sorted[i - 1].dist !== a.dist) rank = i + 1
      points[a.uid] = a.dist === 0 ? 120 : ([100, 70, 40][rank - 1] ?? 15)
      detail[a.uid] = { value: a.value, dist: a.dist, rank, ok: rank === 1 }
    })
    return { points, detail }
  },
})

// ---------- Petit Bac : une lettre, cinq catégories, « Stop ! », puis vérification par les joueurs ----------

/** Barème : 10 points par mot valide, 5 s'il est en double ; `rejected` = réponses retirées par vote. */
function scoreBac(prompt, answers, rejected = new Set()) {
  const letter = compactWord(prompt.letter)
  const valid = (uid, cat, txt) => {
    const c = compactWord(txt)
    return c.length >= 2 && c.startsWith(letter) && !containsBanned(txt) && !rejected.has(`${uid}:${cat}`)
  }
  const counts = {}
  for (const a of answers) {
    for (const cat of prompt.categories) {
      const txt = a.value?.[cat.id] || ''
      if (valid(a.uid, cat.id, txt)) {
        const k = `${cat.id}:${normalizeWord(txt)}`
        counts[k] = (counts[k] || 0) + 1
      }
    }
  }
  const points = {}
  const detail = {}
  for (const a of answers) {
    let total = 0
    const per = {}
    for (const cat of prompt.categories) {
      const txt = a.value?.[cat.id] || ''
      const ok = valid(a.uid, cat.id, txt)
      const pts = ok ? (counts[`${cat.id}:${normalizeWord(txt)}`] > 1 ? 5 : 10) : 0
      total += pts
      per[cat.id] = { text: txt, ok, pts, ...(rejected.has(`${a.uid}:${cat.id}`) ? { contested: true } : {}) }
    }
    points[a.uid] = total
    detail[a.uid] = { answers: per, ok: total > 0 }
  }
  return { points, detail }
}

/** Une réponse est retirée si la majorité des autres joueurs la contestent. */
export function bacThreshold(state) {
  const others = Math.max(1, activeIds(state).length - 1)
  return Math.floor(others / 2) + 1
}

export const petitbac = roundGame({
  id: 'petitbac',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.petitbac.choices,
  defaultRounds: LIVE_ROUNDS.petitbac.def,
  graceMs: 2500,
  revealMs: 15000,
  answerMs: () => 90000,
  makeRound(state) {
    const lang = state.settings.lang
    const letters = String(bacBank.letters[lang] || bacBank.letters.fr).split('')
    const letter = pickUnused(letters, state.g.used, (x) => x)
    const categories = shuffle(bacBank.categories)
      .slice(0, 5)
      .map((c) => ({ id: c.id, label: loc(c, lang) }))
    return { prompt: { letter, categories }, secret: {}, used: [letter] }
  },
  parse(state, round, value) {
    ensure(value && typeof value === 'object', 400, 'answers', 'Réponses invalides.')
    const out = {}
    for (const c of round.prompt.categories) out[c.id] = cleanLine(str(value[c.id], 80)).slice(0, 32)
    return out
  },
  afterAnswer(state, uid, value) {
    const complete = state.g.cur.prompt.categories.every((c) => compactWord(value[c.id]).length >= 2)
    return complete ? { stop: 10000 } : null
  },
  score: (state, round, answers) => scoreBac(round.prompt, answers),
  votes: {
    sanitize(state, g, voter, targets) {
      const rv = g.lastReveal
      const out = new Set()
      for (const raw of Array.isArray(targets) ? targets.slice(0, 60) : []) {
        const [uid, cat] = str(raw, 64).split(':')
        if (!uid || !cat || uid === voter) continue
        if (rv?.detail?.[uid]?.answers?.[cat]?.ok) out.add(`${uid}:${cat}`)
      }
      return [...out]
    },
    view(state, g, votes, me) {
      const tally = {}
      let mine = []
      for (const v of votes) {
        for (const t of v.targets || []) tally[t] = (tally[t] || 0) + 1
        if (v.uid === me) mine = v.targets || []
      }
      return { round: g.round, tally, mine, need: bacThreshold(state) }
    },
    settle(state, g, votes) {
      const rv = g.lastReveal
      if (!rv || rv.settled) return
      rv.settled = true
      const tally = {}
      for (const v of votes) for (const t of v.targets || []) tally[t] = (tally[t] || 0) + 1
      const need = bacThreshold(state)
      const rejected = new Set(Object.entries(tally).filter(([, n]) => n >= need).map(([k]) => k))
      if (!rejected.size) return
      const answers = Object.entries(rv.detail).map(([uid, d]) => ({ uid, value: Object.fromEntries(Object.entries(d.answers || {}).map(([c, x]) => [c, x.text])) }))
      const { points, detail } = scoreBac(rv.prompt, answers, rejected)
      for (const uid of Object.keys(points)) {
        state.scores[uid] = (state.scores[uid] || 0) + points[uid] - (rv.points[uid] || 0)
        if (rv.detail[uid]?.ok && !detail[uid].ok) state.found[uid] = Math.max(0, (state.found[uid] || 0) - 1)
      }
      rv.points = points
      rv.detail = detail
      rv.rejected = [...rejected]
      const h = g.history.find((x) => x.index === rv.index)
      if (h) h.points = points
    },
  },
})

// ---------- Calcul express : premier à trouver, de plus en plus corsé ----------

function makeProblem(index, total) {
  const level = Math.min(2, Math.floor((index / Math.max(1, total)) * 3))
  const r = (a, b) => a + randomInt(b - a + 1)
  const kinds = [
    // niveau 1
    [
      () => {
        const a = r(6, 59)
        const b = r(6, 39)
        return { text: `${a} + ${b}`, answer: a + b }
      },
      () => {
        const a = r(20, 99)
        const b = r(5, a - 5)
        return { text: `${a} − ${b}`, answer: a - b }
      },
      () => {
        const a = r(2, 9)
        const b = r(2, 9)
        return { text: `${a} × ${b}`, answer: a * b }
      },
    ],
    // niveau 2
    [
      () => {
        const a = r(3, 9)
        const b = r(4, 12)
        return { text: `${a} × ${b}`, answer: a * b }
      },
      () => {
        const a = r(45, 199)
        const b = r(25, 99)
        return { text: `${a} + ${b}`, answer: a + b }
      },
      () => {
        const b = r(3, 9)
        const q = r(3, 12)
        return { text: `${b * q} ÷ ${b}`, answer: q }
      },
      () => {
        const a = r(12, 60)
        const x = r(8, 40)
        return { text: `? + ${a} = ${a + x}`, answer: x, eq: true }
      },
    ],
    // niveau 3
    [
      () => {
        const a = r(6, 15)
        const b = r(6, 15)
        return { text: `${a} × ${b}`, answer: a * b }
      },
      () => {
        const a = r(4, 12)
        const b = r(4, 9)
        const c = r(5, 30)
        return { text: `${a} × ${b} − ${c}`, answer: a * b - c }
      },
      () => {
        const b = r(6, 12)
        const q = r(6, 15)
        return { text: `${b * q} ÷ ${b}`, answer: q }
      },
      () => {
        const a = r(120, 499)
        const b = r(60, 299)
        return { text: `${a} − ${b}`, answer: a - b }
      },
      () => {
        const n = r(11, 19)
        return { text: `${n}²`, answer: n * n }
      },
      () => {
        const b = r(4, 9)
        const x = r(6, 14)
        return { text: `? × ${b} = ${b * x}`, answer: x, eq: true }
      },
      () => {
        const a = r(2, 9)
        const b = r(2, 9)
        const c = r(10, 40)
        return { text: `${c} + ${a} × ${b}`, answer: c + a * b }
      },
    ],
  ][level]
  return kinds[randomInt(kinds.length)]()
}

export const calcul = roundGame({
  id: 'calcul',
  mode: 'race',
  roundChoices: LIVE_ROUNDS.calcul.choices,
  defaultRounds: LIVE_ROUNDS.calcul.def,
  answerMs: () => 15000,
  makeRound(state, index) {
    const p = makeProblem(index, state.settings.rounds)
    return { prompt: { text: p.text, eq: !!p.eq }, secret: { answer: p.answer } }
  },
  check(state, round, value) {
    const n = Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) && n === round.secret.answer
  },
  score(state, round, answers) {
    const points = {}
    const detail = {}
    answers.forEach((a, i) => {
      points[a.uid] = racePoints(i)
      detail[a.uid] = { ok: true, rank: i + 1, ms: a.at - state.g.phaseStart }
    })
    return { points, detail }
  },
})

// ---------- Mots mélangés : remettre les lettres dans l'ordre ----------

function anagramPool(lang) {
  const bank = lang === 'en' ? wordsEn : wordsFr
  const out = []
  for (const [theme, diffs] of Object.entries(bank.themes)) {
    for (const diff of ['facile', 'moyen', 'difficile']) {
      for (const entry of diffs[diff] || []) {
        const answers = String(entry).split('|')
        const word = answers[0]
        const c = compactWord(word)
        if (/^\p{L}+$/u.test(word) && c.length >= 5 && c.length <= 9) out.push({ word, answers, theme })
      }
    }
  }
  return out
}

export const anagramme = roundGame({
  id: 'anagramme',
  mode: 'race',
  roundChoices: LIVE_ROUNDS.anagramme.choices,
  defaultRounds: LIVE_ROUNDS.anagramme.def,
  answerMs: () => 30000,
  makeRound(state, index, now) {
    const pick = pickUnused(anagramPool(state.settings.lang), state.g.used, (x) => x.word)
    const plain = compactWord(pick.word).toUpperCase()
    let letters = plain.split('')
    for (let i = 0; i < 6 && letters.join('') === plain; i++) letters = shuffle(letters)
    return { prompt: { letters, length: letters.length, theme: pick.theme, hintAt: now + 12000, hint2At: now + 21000 }, secret: { word: pick.word, answers: pick.answers }, used: [pick.word] }
  },
  publicPrompt(state, cur, now) {
    // Indices : la première lettre au bout de 12 s, la dernière au bout de 21 s.
    const plain = compactWord(cur.secret.word).toUpperCase()
    if (now >= cur.prompt.hint2At) return { ...cur.prompt, first: plain.charAt(0), last: plain.charAt(plain.length - 1) }
    if (now >= cur.prompt.hintAt) return { ...cur.prompt, first: plain.charAt(0) }
    return cur.prompt
  },
  check(state, round, value) {
    return judgeGuess(str(value, 60), round.secret.answers) === 'correct'
  },
  score(state, round, answers) {
    const points = {}
    const detail = {}
    answers.forEach((a, i) => {
      points[a.uid] = racePoints(i)
      detail[a.uid] = { ok: true, rank: i + 1, ms: a.at - state.g.phaseStart }
    })
    return { points, detail }
  },
})

export const LIVE_GAMES = { quiz, reflexe, justenombre, petitbac, calcul, anagramme }
