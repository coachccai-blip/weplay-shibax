// Jeux « dans la conversation » : on joue à son rythme, la carte du fil se met à jour en direct.
import wordsFr from '../../data/mots.json' with { type: 'json' }
import wordsEn from '../../data/words-en.json' with { type: 'json' }
import dilemmaBank from '../../data/dilemmas.json' with { type: 'json' }
import { fail, ensure, str, int } from '../http.js'
import { judgeGuess, validateCustomWord, compactWord, hintPattern, cleanLine } from '../../shared/text.js'
import { containsBanned } from '../../shared/moderation.js'
import { USER_ID_RE } from '../../shared/ids.js'

const HOUR = 3600000
const rnd = (n) => {
  const b = new Uint32Array(1)
  globalThis.crypto.getRandomValues(b)
  return b[0] % n
}

function wordEntries(lang, { singleWord = false, maxLen = 25 } = {}) {
  const bank = lang === 'en' ? wordsEn : wordsFr
  const out = []
  for (const diffs of Object.values(bank.themes)) {
    for (const diff of ['facile', 'moyen', 'difficile']) {
      for (const entry of diffs[diff] || []) {
        const answers = String(entry).split('|')
        const display = answers[0]
        if (singleWord && !/^\p{L}+$/u.test(display)) continue
        if (compactWord(display).length > maxLen) continue
        out.push({ display, answers, difficulty: diff })
      }
    }
  }
  return out
}

export function suggestWords(lang, n = 3) {
  const pool = wordEntries(lang)
  const out = []
  for (const diff of ['facile', 'moyen', 'difficile'].slice(0, n)) {
    const list = pool.filter((w) => w.difficulty === diff)
    out.push(list[rnd(list.length)].display)
  }
  return out
}

/** Duel : adversaire choisi parmi les membres, ou défi ouvert au premier qui accepte. */
function duelPlayers(ctx, options) {
  const opponent = str(options?.opponent, 20)
  if (opponent) {
    ensure(USER_ID_RE.test(opponent) && opponent !== ctx.uid, 400, 'opponent', 'Choisis un adversaire du groupe.')
    ensure(ctx.room.members.some((m) => m.id === opponent), 400, 'opponent', 'Choisis un adversaire du groupe.')
    return { players: [ctx.uid, opponent], open: false }
  }
  return { players: [ctx.uid], open: true }
}

function joinDuel(state, uid) {
  ensure(state.open && state.order.length === 1, 409, 'not_open', 'Ce défi a déjà un adversaire.')
  ensure(uid !== state.order[0], 400, 'self', 'Attends qu’un autre membre relève ton défi.')
  state.order.push(uid)
  state.open = false
  return true
}

function lines(board, w, h, n) {
  const out = []
  const at = (x, y) => board[y * w + x]
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (const [dx, dy] of dirs) {
        const cells = []
        for (let k = 0; k < n; k++) {
          const cx = x + dx * k
          const cy = y + dy * k
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) break
          cells.push(cy * w + cx)
        }
        if (cells.length === n && at(x, y) && cells.every((c) => board[c] === at(x, y))) out.push(cells)
      }
  return out
}

// ---------- Morpion ----------

export const morpion = {
  id: 'morpion',
  duel: true,
  create(ctx, options) {
    const { players, open } = duelPlayers(ctx, options)
    return { players, open, data: { board: Array(9).fill(null), turn: 0, moves: 0, line: null }, ttl: 7 * 24 * HOUR }
  },
  act(state, uid, body) {
    const d = state.data
    if (body.type === 'join') return joinDuel(state, uid)
    ensure(body.type === 'move', 400, 'action', 'Action inconnue.')
    ensure(!state.open, 409, 'not_started', 'Il faut d’abord un adversaire.')
    ensure(state.order[d.turn] === uid, 409, 'not_your_turn', 'Ce n’est pas ton tour.')
    const cell = int(body.cell, -1)
    ensure(cell >= 0 && cell < 9 && !d.board[cell], 400, 'cell', 'Case déjà prise.')
    d.board[cell] = d.turn === 0 ? 'X' : 'O'
    d.moves++
    const found = lines(d.board, 3, 3, 3)
    if (found.length) d.line = found[0]
    else d.turn = 1 - d.turn
    return true
  },
  isOver: (s) => !!s.data.line || s.data.moves >= 9,
  result(s) {
    if (s.data.line) return { outcome: 'win', winners: [s.order[s.data.turn]] }
    return { outcome: 'draw', winners: [] }
  },
  view: (s, uid) => ({ ...s.data, myMark: s.order[0] === uid ? 'X' : s.order[1] === uid ? 'O' : null, myTurn: !s.open && s.status === 'open' && s.order[s.data.turn] === uid }),
}

// ---------- Puissance 4 ----------

export const puissance4 = {
  id: 'puissance4',
  duel: true,
  create(ctx, options) {
    const { players, open } = duelPlayers(ctx, options)
    return { players, open, data: { board: Array(42).fill(null), turn: 0, moves: 0, line: null, last: null }, ttl: 7 * 24 * HOUR }
  },
  act(state, uid, body) {
    const d = state.data
    if (body.type === 'join') return joinDuel(state, uid)
    ensure(body.type === 'move', 400, 'action', 'Action inconnue.')
    ensure(!state.open, 409, 'not_started', 'Il faut d’abord un adversaire.')
    ensure(state.order[d.turn] === uid, 409, 'not_your_turn', 'Ce n’est pas ton tour.')
    const col = int(body.col, -1)
    ensure(col >= 0 && col < 7, 400, 'cell', 'Colonne invalide.')
    let row = -1
    for (let y = 5; y >= 0; y--) if (!d.board[y * 7 + col]) {
      row = y
      break
    }
    ensure(row >= 0, 400, 'cell', 'Cette colonne est pleine.')
    d.board[row * 7 + col] = d.turn === 0 ? 'A' : 'B'
    d.last = row * 7 + col
    d.moves++
    const found = lines(d.board, 7, 6, 4)
    if (found.length) d.line = found[0]
    else d.turn = 1 - d.turn
    return true
  },
  isOver: (s) => !!s.data.line || s.data.moves >= 42,
  result(s) {
    if (s.data.line) return { outcome: 'win', winners: [s.order[s.data.turn]] }
    return { outcome: 'draw', winners: [] }
  },
  view: (s, uid) => ({ ...s.data, myPiece: s.order[0] === uid ? 'A' : s.order[1] === uid ? 'B' : null, myTurn: !s.open && s.status === 'open' && s.order[s.data.turn] === uid }),
}

// ---------- Shifumi (pierre, feuille, ciseaux) en deux manches gagnantes ----------

const BEATS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' }

export const shifumi = {
  id: 'shifumi',
  duel: true,
  create(ctx, options) {
    const { players, open } = duelPlayers(ctx, options)
    return { players, open, data: { rounds: [{ picks: {} }], score: {} }, ttl: 3 * 24 * HOUR }
  },
  act(state, uid, body) {
    const d = state.data
    if (body.type === 'join') return joinDuel(state, uid)
    ensure(body.type === 'pick', 400, 'action', 'Action inconnue.')
    ensure(!state.open, 409, 'not_started', 'Il faut d’abord un adversaire.')
    ensure(state.order.includes(uid), 403, 'not_player', 'Tu ne joues pas dans ce duel.')
    const choice = str(body.choice, 10)
    ensure(BEATS[choice], 400, 'choice', 'Choisis pierre, feuille ou ciseaux.')
    const round = d.rounds[d.rounds.length - 1]
    ensure(!round.picks[uid], 409, 'already_answered', 'Tu as déjà joué cette manche.')
    round.picks[uid] = choice
    const [a, b] = state.order
    if (round.picks[a] && round.picks[b]) {
      const pa = round.picks[a]
      const pb = round.picks[b]
      round.winner = pa === pb ? null : BEATS[pa] === pb ? a : b
      if (round.winner) d.score[round.winner] = (d.score[round.winner] || 0) + 1
      if (!shifumi.isOver(state)) d.rounds.push({ picks: {} })
    }
    return true
  },
  isOver: (s) => Object.values(s.data.score).some((n) => n >= 2) || s.data.rounds.filter((r) => r.picks && Object.keys(r.picks).length === 2).length >= 7,
  result(s) {
    const [a, b] = s.order
    const sa = s.data.score[a] || 0
    const sb = s.data.score[b] || 0
    if (sa === sb) return { outcome: 'draw', winners: [] }
    return { outcome: 'win', winners: [sa > sb ? a : b] }
  },
  view(s, uid) {
    // Le choix de l'adversaire reste caché tant que la manche n'est pas jouée par les deux.
    const rounds = s.data.rounds.map((r) => {
      const both = s.order.every((u) => r.picks[u])
      if (both) return r
      const picks = {}
      for (const [u, c] of Object.entries(r.picks)) picks[u] = u === uid ? c : 'hidden'
      return { picks }
    })
    const current = s.data.rounds[s.data.rounds.length - 1]
    return { rounds, score: s.data.score, myTurn: !s.open && s.status === 'open' && s.order.includes(uid) && !current.picks[uid] }
  },
}

// ---------- Devine mon dessin (Draw It à son rythme) ----------

export const dessin = {
  id: 'dessin',
  needsImage: true,
  create(ctx, options) {
    const check = validateCustomWord(str(options?.word, 80))
    ensure(check.ok, 400, 'custom_word', check.error)
    ensure(!containsBanned(check.value), 400, 'custom_banned', 'Ce mot n’est pas autorisé. Choisis-en un autre.')
    const known = wordEntries(ctx.lang).find((w) => compactWord(w.display) === compactWord(check.value))
    return {
      players: [ctx.uid],
      data: { word: check.value, answers: known?.answers || [check.value], finders: [], attempts: {} },
      ttl: 24 * HOUR,
    }
  },
  act(state, uid, body, now, ctx) {
    const d = state.data
    if (body.type === 'close') {
      ensure(uid === state.createdBy, 403, 'not_host', 'Seul l’auteur du dessin peut clore la partie.')
      d.closed = true
      return true
    }
    ensure(body.type === 'guess', 400, 'action', 'Action inconnue.')
    ensure(uid !== state.createdBy, 403, 'drawer', 'Tu as fait le dessin : laisse deviner les autres !')
    ensure(!d.finders.some((f) => f.uid === uid), 409, 'already_found', 'Tu as déjà trouvé !')
    const tries = d.attempts[uid] || 0
    ensure(tries < 20, 429, 'too_many_tries', 'Plus d’essais pour ce dessin.')
    d.attempts[uid] = tries + 1
    if (!state.order.includes(uid)) state.order.push(uid)
    const verdict = judgeGuess(str(body.text, 80), d.answers)
    if (verdict === 'correct') {
      d.finders.push({ uid, at: now })
      const others = ctx.room.members.filter((m) => m.id !== state.createdBy).length
      if (d.finders.length >= others) d.closed = true
    }
    return { result: verdict, tries: d.attempts[uid] }
  },
  isOver: (s) => !!s.data.closed,
  result(s) {
    const finders = s.data.finders.map((f) => f.uid)
    return { outcome: 'team', winners: finders.length ? [...finders, s.createdBy] : [], finders }
  },
  view(s, uid) {
    const d = s.data
    const over = s.status !== 'open'
    const mine = uid === s.createdBy
    const found = d.finders.some((f) => f.uid === uid)
    return {
      hint: hintPattern(d.word).map((p) => p.t),
      word: over || mine || found ? d.word : null,
      finders: d.finders,
      tries: d.attempts[uid] || 0,
      found,
      image: `/api/async/${s.id}/image`,
    }
  },
}

// ---------- Tu préfères ? (sondage) ----------

export const tupreferes = {
  id: 'tupreferes',
  poll: true,
  create(ctx, options) {
    const custom = Array.isArray(options?.options) ? options.options.map((o) => cleanLine(str(o, 120)).slice(0, 80)) : null
    if (custom) {
      ensure(custom.length === 2 && custom.every((o) => o.length >= 2), 400, 'poll_options', 'Écris deux propositions.')
      ensure(!custom.some(containsBanned), 400, 'custom_banned', 'Ce texte n’est pas autorisé.')
      return { players: [ctx.uid], data: { custom, item: null, votes: {} }, ttl: 24 * HOUR }
    }
    const item = dilemmaBank.items[rnd(dilemmaBank.items.length)]
    return { players: [ctx.uid], data: { custom: null, item: item.id, fr: item.fr, en: item.en, votes: {} }, ttl: 24 * HOUR }
  },
  act(state, uid, body, now, ctx) {
    const d = state.data
    if (body.type === 'close') {
      ensure(uid === state.createdBy, 403, 'not_host', 'Seul l’auteur peut clore le sondage.')
      d.closed = true
      return true
    }
    ensure(body.type === 'vote', 400, 'action', 'Action inconnue.')
    const choice = int(body.choice, -1)
    ensure(choice === 0 || choice === 1, 400, 'choice', 'Choisis une des deux propositions.')
    d.votes[uid] = choice
    if (!state.order.includes(uid)) state.order.push(uid)
    if (Object.keys(d.votes).length >= ctx.room.members.length) d.closed = true
    return true
  },
  isOver: (s) => !!s.data.closed,
  result: () => ({ outcome: 'poll', winners: [] }),
  view(s, uid) {
    const d = s.data
    const voted = d.votes[uid] !== undefined
    const showResults = voted || s.status !== 'open'
    const counts = [0, 0]
    const voters = [[], []]
    for (const [u, c] of Object.entries(d.votes)) {
      counts[c]++
      voters[c].push(u)
    }
    return { custom: d.custom, fr: d.fr, en: d.en, myVote: voted ? d.votes[uid] : null, total: Object.keys(d.votes).length, counts: showResults ? counts : null, voters: showResults ? voters : null }
  },
}

// ---------- Le pendu (à plusieurs) ----------

const letterOf = (txt) => compactWord(txt).charAt(0).toUpperCase()

export const pendu = {
  id: 'pendu',
  create(ctx, options) {
    let word
    let setter = null
    if (options?.word) {
      const check = validateCustomWord(str(options.word, 80))
      ensure(check.ok, 400, 'custom_word', check.error)
      ensure(!containsBanned(check.value), 400, 'custom_banned', 'Ce mot n’est pas autorisé. Choisis-en un autre.')
      word = { display: check.value, answers: [check.value] }
      setter = ctx.uid
    } else {
      const list = wordEntries(ctx.lang, { singleWord: true, maxLen: 12 }).filter((w) => compactWord(w.display).length >= 4)
      word = list[rnd(list.length)]
    }
    return { players: setter ? [] : [ctx.uid], data: { word: word.display, answers: word.answers, setter, tried: [], wrong: 0, max: 7, by: {}, solvedBy: null }, ttl: 3 * 24 * HOUR }
  },
  act(state, uid, body) {
    const d = state.data
    ensure(uid !== d.setter, 403, 'drawer', 'Tu as choisi le mot : laisse les autres chercher !')
    if (!state.order.includes(uid)) state.order.push(uid)
    const letters = new Set(compactWord(d.word).toUpperCase().split(''))
    if (body.type === 'letter') {
      const l = letterOf(str(body.letter, 4))
      ensure(/^[A-Z]$/.test(l), 400, 'letter', 'Propose une lettre.')
      ensure(!d.tried.includes(l), 409, 'letter_tried', 'Cette lettre a déjà été proposée.')
      d.tried.push(l)
      d.by[uid] = (d.by[uid] || 0) + 1
      if (!letters.has(l)) d.wrong++
      return { result: letters.has(l) ? 'hit' : 'miss' }
    }
    ensure(body.type === 'word', 400, 'action', 'Action inconnue.')
    const ok = judgeGuess(str(body.text, 80), d.answers) === 'correct'
    d.by[uid] = (d.by[uid] || 0) + 1
    if (ok) d.solvedBy = uid
    else d.wrong++
    return { result: ok ? 'correct' : 'miss' }
  },
  isOver(s) {
    const d = s.data
    const letters = new Set(compactWord(d.word).toUpperCase().split(''))
    const all = [...letters].every((l) => d.tried.includes(l))
    return !!d.solvedBy || all || d.wrong >= d.max
  },
  result(s) {
    const d = s.data
    return d.wrong >= d.max && !d.solvedBy ? { outcome: 'lost', winners: [] } : { outcome: 'team', winners: Object.keys(d.by) }
  },
  view(s) {
    const d = s.data
    const over = s.status !== 'open'
    const chars = Array.from(d.word)
    const cells = hintPattern(d.word).map((p) => {
      if (p.t !== 'l') return { t: p.t }
      const l = letterOf(chars[p.i])
      return over || d.tried.includes(l) ? { t: 'l', c: chars[p.i].toUpperCase() } : { t: 'l' }
    })
    return { cells, tried: d.tried, wrong: d.wrong, max: d.max, word: over ? d.word : null, setter: d.setter, solvedBy: d.solvedBy, by: d.by }
  },
}

// ---------- Devine le nombre ----------

export const devine = {
  id: 'devine',
  create(ctx, options) {
    const max = int(options?.max, 100) === 1000 ? 1000 : 100
    return { players: [ctx.uid], data: { max, secret: 1 + rnd(max), guesses: [], finder: null, last: {} }, ttl: 2 * 24 * HOUR }
  },
  act(state, uid, body, now) {
    const d = state.data
    ensure(body.type === 'guess', 400, 'action', 'Action inconnue.')
    const n = int(body.n, -1)
    ensure(n >= 1 && n <= d.max, 400, 'number', `Propose un nombre entre 1 et ${d.max}.`, { max: d.max })
    if (d.last[uid] && now - d.last[uid] < 3000) fail(429, 'too_fast', 'Pas si vite !', { retryAfterMs: 3000 - (now - d.last[uid]) })
    d.last[uid] = now
    if (!state.order.includes(uid)) state.order.push(uid)
    const hint = n === d.secret ? 'bingo' : n < d.secret ? 'plus' : 'moins'
    d.guesses.push({ uid, n, hint, at: now })
    if (d.guesses.length > 200) d.guesses = d.guesses.slice(-200)
    if (hint === 'bingo') d.finder = uid
    return { result: hint }
  },
  isOver: (s) => !!s.data.finder,
  result: (s) => ({ outcome: 'win', winners: [s.data.finder] }),
  view(s) {
    const d = s.data
    let lo = 1
    let hi = d.max
    for (const g of d.guesses) {
      if (g.hint === 'plus') lo = Math.max(lo, g.n + 1)
      if (g.hint === 'moins') hi = Math.min(hi, g.n - 1)
    }
    return { max: d.max, guesses: d.guesses.slice(-30), count: d.guesses.length, lo, hi, finder: d.finder, secret: s.status !== 'open' ? d.secret : null }
  },
}

export const ASYNC_GAMES = { morpion, puissance4, shifumi, dessin, tupreferes, pendu, devine }
