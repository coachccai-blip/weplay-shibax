// Jeux en temps réel construits sur le moteur « par manches » (server/games/rounds.js).
import quizBank from '../../data/quiz.json' with { type: 'json' }
import estimationBank from '../../data/estimations.json' with { type: 'json' }
import bacBank from '../../data/petitbac.json' with { type: 'json' }
import wordsFr from '../../data/mots.json' with { type: 'json' }
import wordsEn from '../../data/words-en.json' with { type: 'json' }
import { roundGame, racePoints } from './rounds.js'
import { shuffle, randomInt } from './common.js'
import { ensure, str, int } from '../http.js'
import { compactWord, cleanLine, judgeGuess, normalizeWord } from '../../shared/text.js'
import { containsBanned } from '../../shared/moderation.js'
import { LIVE_ROUNDS } from '../../shared/constants.js'

const loc = (item, lang) => item[lang] || item.fr

function pickUnused(list, used, idOf) {
  const set = new Set(used)
  const pool = list.filter((x) => !set.has(idOf(x)))
  const from = pool.length ? pool : list
  return from[randomInt(from.length)]
}

// ---------- Quiz de la meute : 4 réponses, la vitesse compte ----------

export const quiz = roundGame({
  id: 'quiz',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.quiz.choices,
  defaultRounds: LIVE_ROUNDS.quiz.def,
  answerMs: () => 15000,
  makeRound(state) {
    const q = pickUnused(quizBank.questions, state.g.used, (x) => x.id)
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
    for (const a of answers) {
      const ok = a.value === round.secret.correct
      const remaining = Math.max(0, start + 15000 - a.at)
      points[a.uid] = ok ? Math.round(50 + (50 * remaining) / 15000) : 0
      detail[a.uid] = { value: a.value, ok }
    }
    return { points, detail }
  },
})

// ---------- Réflexe : le shiba surgit, le plus rapide gagne ----------

export const reflexe = roundGame({
  id: 'reflexe',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.reflexe.choices,
  defaultRounds: LIVE_ROUNDS.reflexe.def,
  answerMs: (settings, cur) => (cur ? cur.prompt.appearIn : 3250) + 3000,
  makeRound(state, index, now) {
    const appearIn = 1500 + randomInt(3500)
    return { prompt: { appearAt: now + appearIn, appearIn, spot: randomInt(5), coat: ['roux', 'creme', 'sesame', 'noir'][randomInt(4)] }, secret: {} }
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

// ---------- Petit Bac : une lettre, cinq catégories, « Stop ! » ----------

export const petitbac = roundGame({
  id: 'petitbac',
  mode: 'single',
  roundChoices: LIVE_ROUNDS.petitbac.choices,
  defaultRounds: LIVE_ROUNDS.petitbac.def,
  graceMs: 2500,
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
  score(state, round, answers) {
    const letter = compactWord(round.prompt.letter)
    const valid = (txt) => {
      const c = compactWord(txt)
      return c.length >= 2 && c.startsWith(letter) && !containsBanned(txt)
    }
    const counts = {}
    for (const a of answers) {
      for (const cat of round.prompt.categories) {
        const txt = a.value?.[cat.id] || ''
        if (valid(txt)) {
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
      for (const cat of round.prompt.categories) {
        const txt = a.value?.[cat.id] || ''
        const ok = valid(txt)
        const pts = ok ? (counts[`${cat.id}:${normalizeWord(txt)}`] > 1 ? 5 : 10) : 0
        total += pts
        per[cat.id] = { text: txt, ok, pts }
      }
      points[a.uid] = total
      detail[a.uid] = { answers: per, ok: total > 0 }
    }
    return { points, detail }
  },
})

// ---------- Calcul express : premier à trouver, de plus en plus corsé ----------

function makeProblem(index, total) {
  const level = Math.min(2, Math.floor((index / Math.max(1, total)) * 3))
  const r = (a, b) => a + randomInt(b - a + 1)
  const kind = randomInt(level === 0 ? 2 : level === 1 ? 3 : 4)
  if (level === 0) {
    if (kind === 0) {
      const a = r(6, 59)
      const b = r(6, 39)
      return { text: `${a} + ${b}`, answer: a + b }
    }
    const a = r(20, 99)
    const b = r(5, a - 5)
    return { text: `${a} − ${b}`, answer: a - b }
  }
  if (level === 1) {
    if (kind === 0) {
      const a = r(3, 9)
      const b = r(4, 12)
      return { text: `${a} × ${b}`, answer: a * b }
    }
    if (kind === 1) {
      const a = r(45, 199)
      const b = r(25, 99)
      return { text: `${a} + ${b}`, answer: a + b }
    }
    const b = r(3, 9)
    const q = r(3, 12)
    return { text: `${b * q} ÷ ${b}`, answer: q }
  }
  if (kind === 0) {
    const a = r(6, 15)
    const b = r(6, 15)
    return { text: `${a} × ${b}`, answer: a * b }
  }
  if (kind === 1) {
    const a = r(4, 12)
    const b = r(4, 9)
    const c = r(5, 30)
    return { text: `${a} × ${b} − ${c}`, answer: a * b - c }
  }
  if (kind === 2) {
    const b = r(6, 12)
    const q = r(6, 15)
    return { text: `${b * q} ÷ ${b}`, answer: q }
  }
  const a = r(120, 499)
  const b = r(60, 299)
  return { text: `${a} − ${b}`, answer: a - b }
}

export const calcul = roundGame({
  id: 'calcul',
  mode: 'race',
  roundChoices: LIVE_ROUNDS.calcul.choices,
  defaultRounds: LIVE_ROUNDS.calcul.def,
  answerMs: () => 15000,
  makeRound(state, index) {
    const p = makeProblem(index, state.settings.rounds)
    return { prompt: { text: p.text }, secret: { answer: p.answer } }
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
    return { prompt: { letters, length: letters.length, theme: pick.theme, hintAt: now + 15000 }, secret: { word: pick.word, answers: pick.answers }, used: [pick.word] }
  },
  publicPrompt(state, cur, now) {
    return now >= cur.prompt.hintAt ? { ...cur.prompt, first: compactWord(cur.secret.word).charAt(0).toUpperCase() } : cur.prompt
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
