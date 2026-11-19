// Règles des nouveaux jeux : jeux dans la conversation (coups, fin de partie, informations cachées)
// et jeux en direct par manches (barèmes).
import test from 'node:test'
import assert from 'node:assert/strict'
import { ASYNC_GAMES, suggestWords } from '../../server/async/games.js'
import { LIVE_GAMES } from '../../server/games/live.js'
import { MODULES } from '../../server/games/index.js'

// Identifiants au format des comptes (SHX-XXXXXX).
const [u1, u2, u3] = ['SHX-AAAAA2', 'SHX-BBBBB3', 'SHX-CCCCC4']
const room = { members: [{ id: u1 }, { id: u2 }, { id: u3 }] }

function make(type, uid = u1, options = {}, lang = 'fr') {
  const mod = ASYNC_GAMES[type]
  const init = mod.create({ uid, room, lang, now: 0 }, options)
  return { mod, state: { id: 'g1', type, createdBy: uid, status: 'open', open: !!init.open, order: init.players, data: init.data, result: null } }
}

let clock = 1_000_000
function act(g, uid, body) {
  clock += 5000
  const out = g.mod.act(g.state, uid, body, clock, { room })
  if (g.mod.isOver(g.state)) {
    g.state.status = 'finished'
    g.state.result = g.mod.result(g.state)
  }
  return out
}

const code = (fn) => {
  try {
    fn()
  } catch (err) {
    return err.code
  }
  return null
}

test('morpion : défi ouvert, tour par tour, victoire en ligne', () => {
  const g = make('morpion')
  assert.equal(g.state.open, true)
  assert.equal(code(() => act(g, u1, { type: 'move', cell: 0 })), 'not_started')
  assert.equal(code(() => act(g, u1, { type: 'join' })), 'self')
  act(g, u2, { type: 'join' })
  assert.deepEqual(g.state.order, [u1, u2])
  assert.equal(code(() => act(g, u3, { type: 'join' })), 'not_open')
  act(g, u1, { type: 'move', cell: 0 })
  assert.equal(code(() => act(g, u1, { type: 'move', cell: 1 })), 'not_your_turn')
  assert.equal(code(() => act(g, u2, { type: 'move', cell: 0 })), 'cell')
  act(g, u2, { type: 'move', cell: 3 })
  act(g, u1, { type: 'move', cell: 1 })
  act(g, u2, { type: 'move', cell: 4 })
  assert.equal(g.mod.view(g.state, u1).myTurn, true)
  act(g, u1, { type: 'move', cell: 2 })
  assert.equal(g.state.status, 'finished')
  assert.deepEqual(g.state.result, { outcome: 'win', winners: [u1] })
  assert.deepEqual(g.state.data.line, [0, 1, 2])
})

test('morpion : match nul quand la grille est pleine', () => {
  const g = make('morpion', u1, { opponent: u2 })
  for (const [uid, cell] of [[u1, 0], [u2, 1], [u1, 2], [u2, 4], [u1, 3], [u2, 5], [u1, 7], [u2, 6], [u1, 8]]) act(g, uid, { type: 'move', cell })
  assert.deepEqual(g.state.result, { outcome: 'draw', winners: [] })
})

test('quatre en ligne : les jetons tombent, alignement vertical, colonne pleine', () => {
  const g = make('puissance4', u1, { opponent: u2 })
  assert.equal(code(() => make('puissance4', u1, { opponent: 'SHX-ZZZZZ9' })), 'opponent')
  act(g, u1, { type: 'move', col: 0 })
  assert.equal(g.state.data.board[35], 'A', 'le premier jeton tombe en bas')
  act(g, u2, { type: 'move', col: 1 })
  act(g, u1, { type: 'move', col: 0 })
  act(g, u2, { type: 'move', col: 1 })
  act(g, u1, { type: 'move', col: 0 })
  act(g, u2, { type: 'move', col: 1 })
  act(g, u1, { type: 'move', col: 0 })
  assert.deepEqual(g.state.result, { outcome: 'win', winners: [u1] })
  const h = make('puissance4', u1, { opponent: u2 })
  for (let i = 0; i < 6; i++) act(h, i % 2 ? u2 : u1, { type: 'move', col: 3 })
  assert.equal(code(() => act(h, u1, { type: 'move', col: 3 })), 'cell')
})

test('shifumi : coup caché jusqu’à ce que les deux aient joué, deux manches gagnantes', () => {
  const g = make('shifumi', u1, { opponent: u2 })
  act(g, u1, { type: 'pick', choice: 'pierre' })
  assert.equal(g.mod.view(g.state, u2).rounds[0].picks[u1], 'hidden')
  assert.equal(g.mod.view(g.state, u1).rounds[0].picks[u1], 'pierre')
  assert.equal(code(() => act(g, u1, { type: 'pick', choice: 'feuille' })), 'already_answered')
  act(g, u2, { type: 'pick', choice: 'ciseaux' })
  assert.equal(g.state.data.rounds[0].winner, u1)
  act(g, u1, { type: 'pick', choice: 'feuille' })
  act(g, u2, { type: 'pick', choice: 'feuille' })
  assert.equal(g.state.data.rounds[1].winner, null, 'égalité')
  act(g, u2, { type: 'pick', choice: 'pierre' })
  act(g, u1, { type: 'pick', choice: 'feuille' })
  assert.deepEqual(g.state.result, { outcome: 'win', winners: [u1] })
})

test('pendu : mot choisi par un membre, lettres, victoire collective ou défaite', () => {
  const g = make('pendu', u1, { word: 'Chat' })
  assert.equal(code(() => act(g, u1, { type: 'letter', letter: 'c' })), 'drawer')
  assert.equal(act(g, u2, { type: 'letter', letter: 'c' }).result, 'hit')
  assert.equal(code(() => act(g, u3, { type: 'letter', letter: 'C' })), 'letter_tried')
  assert.equal(act(g, u3, { type: 'letter', letter: 'z' }).result, 'miss')
  assert.equal(g.mod.view(g.state).word, null, 'le mot reste caché pendant la partie')
  for (const l of ['h', 'a', 't']) act(g, u2, { type: 'letter', letter: l })
  assert.equal(g.state.status, 'finished')
  assert.equal(g.state.result.outcome, 'team')
  assert.deepEqual(g.state.result.winners.sort(), [u2, u3].sort())
  const lost = make('pendu', u1, { word: 'Chat' })
  for (const l of 'BDEFGIJ') act(lost, u2, { type: 'letter', letter: l })
  assert.equal(lost.state.result.outcome, 'lost')
  const random = make('pendu', u1, {}, 'en')
  assert.ok(random.state.order.includes(u1), 'mot surprise : le créateur joue aussi')
})

test('nombre mystère : indices plus / moins, anti-rafale, le premier qui trouve gagne', () => {
  const g = make('devine', u1, { max: 100 })
  const secret = g.state.data.secret
  assert.ok(secret >= 1 && secret <= 100)
  const low = secret > 1 ? 1 : 2
  if (low !== secret) assert.equal(act(g, u2, { type: 'guess', n: low }).result, low < secret ? 'plus' : 'moins')
  assert.equal(code(() => g.mod.act(g.state, u2, { type: 'guess', n: 5 }, clock + 100, { room })), 'too_fast')
  assert.equal(code(() => act(g, u3, { type: 'guess', n: 101 })), 'number')
  assert.equal(act(g, u3, { type: 'guess', n: secret }).result, 'bingo')
  assert.deepEqual(g.state.result, { outcome: 'win', winners: [u3] })
  assert.equal(g.mod.view(g.state).secret, secret)
})

test('tu préfères : résultats visibles après son vote, clos quand tout le groupe a voté', () => {
  const g = make('tupreferes', u1, { options: ['la mer', 'la montagne'] })
  assert.equal(code(() => make('tupreferes', u1, { options: ['x'] })), 'poll_options')
  act(g, u2, { type: 'vote', choice: 1 })
  assert.equal(g.mod.view(g.state, u3).counts, null)
  assert.deepEqual(g.mod.view(g.state, u2).counts, [0, 1])
  act(g, u2, { type: 'vote', choice: 0 })
  assert.deepEqual(g.mod.view(g.state, u2).counts, [1, 0], 'on peut changer d’avis')
  act(g, u1, { type: 'vote', choice: 0 })
  act(g, u3, { type: 'vote', choice: 1 })
  assert.equal(g.state.status, 'finished')
  assert.equal(g.state.result.outcome, 'poll')
  const surprise = make('tupreferes', u1, {})
  assert.ok(surprise.state.data.fr.length === 2 && surprise.state.data.en.length === 2)
})

test('devine mon dessin : le mot reste caché, se termine quand tous les autres ont trouvé', () => {
  const g = make('dessin', u1, { word: 'pomme' })
  assert.equal(g.mod.view(g.state, u2).word, null)
  assert.equal(g.mod.view(g.state, u1).word, 'pomme')
  assert.equal(code(() => act(g, u1, { type: 'guess', text: 'pomme' })), 'drawer')
  assert.equal(act(g, u2, { type: 'guess', text: 'poire' }).result !== 'correct', true)
  assert.equal(act(g, u2, { type: 'guess', text: 'Pommes' }).result, 'masked', 'contient le mot : ni bon ni affiché')
  assert.equal(act(g, u2, { type: 'guess', text: 'POMME' }).result, 'correct')
  assert.equal(g.mod.view(g.state, u2).word, 'pomme')
  assert.equal(act(g, u3, { type: 'guess', text: 'pomme' }).result, 'correct')
  assert.equal(g.state.status, 'finished')
  assert.deepEqual(g.state.result.winners.sort(), [u1, u2, u3].sort())
  assert.equal(code(() => make('dessin', u1, { word: '12' })), 'custom_word')
  assert.equal(suggestWords('en').length, 3)
})

function liveState(type, lang = 'fr') {
  const mod = LIVE_GAMES[type]
  return { mod, state: { settings: mod.defaultSettings({ lang }), g: { round: 0, used: [], phaseStart: 1000, phaseEnd: 16000 } } }
}


test('quiz : bonne réponse rapide = 100 points, mauvaise = 0', () => {
  const { state } = liveState('quiz', 'en')
  const cur = { prompt: { q: 'Q', choices: ['a', 'b', 'c', 'd'] }, secret: { correct: 2 } }
  const out = quizScore(state, cur, [
    { uid: 'a', at: 1000, value: 2 },
    { uid: 'b', at: 8500, value: 2 },
    { uid: 'c', at: 2000, value: 1 },
  ])
  assert.equal(out.points.a, 100)
  assert.equal(out.points.b, 75)
  assert.equal(out.points.c, 0)
  const made = LIVE_GAMES.quiz.defaultSettings({ lang: 'en' })
  assert.equal(made.lang, 'en')
})

function quizScore(state, cur, answers) {
  // Le barème du quiz passe par le module du moteur : on rejoue une fin de manche.
  const mod = MODULES.quiz
  const st = { ...state, status: 'playing', players: {}, scores: {}, found: {}, joinOrder: [] }
  for (const a of answers) {
    st.players[a.uid] = { pseudo: a.uid }
    st.joinOrder.push(a.uid)
  }
  st.g = { ...state.g, total: 5, phase: 'question', cur: { index: 0, ...cur }, history: [], played: 0 }
  const done = mod.tick(st, 99999, { answers, answerIds: answers.map((a) => a.uid), hbLoaded: true }, { endGame() {} })
  assert.equal(done, true)
  return st.g.lastReveal
}

test('moteur par manches : question → révélation → manche suivante, partie valide après 3 manches', () => {
  const mod = MODULES.calcul
  const st = { status: 'playing', settings: mod.defaultSettings(), players: { a: { pseudo: 'A' }, b: { pseudo: 'B' } }, scores: {}, found: {}, joinOrder: ['a', 'b'] }
  mod.start(st, 0)
  assert.equal(st.g.phase, 'question')
  const answer = st.g.cur.secret.answer
  assert.equal(mod.view(st, 'a', 0).prompt.text.length > 2, true)
  assert.equal(mod.view(st, 'a', 0).reveal, undefined, 'la réponse n’est pas envoyée pendant la question')
  let ended = false
  const api = { endGame: () => (ended = true) }
  for (let r = 0; r < st.settings.rounds; r++) {
    const facts = { answers: [{ uid: 'b', at: st.g.phaseStart + 900, ok: true }], answerIds: ['b'], hbLoaded: true }
    mod.tick(st, st.g.phaseEnd + 1, facts, api)
    assert.equal(st.g.phase, 'reveal')
    if (r === 0) assert.equal(mod.view(st, 'a', 0).reveal.secret.answer, answer)
    mod.tick(st, st.g.phaseEnd + 1, {}, api)
  }
  assert.equal(ended, true)
  assert.equal(st.scores.b, 100 * st.settings.rounds)
  assert.equal(mod.finalize(st).valid, true)
  assert.equal(mod.rules.check(st, { secret: { answer: 42 } }, ' 42 '), true)
  assert.equal(mod.rules.check(st, { secret: { answer: 42 } }, '41'), false)
})

test('le juste nombre : le plus proche l’emporte, la réponse exacte vaut 120', () => {
  const mod = MODULES.justenombre
  const st = { status: 'playing', settings: mod.defaultSettings(), players: { a: {}, b: {}, c: {} }, scores: {}, found: {}, joinOrder: ['a', 'b', 'c'] }
  mod.start(st, 0)
  st.g.cur.secret = { answer: 100 }
  mod.tick(st, st.g.phaseEnd + 1, { answers: [{ uid: 'a', at: 1, value: 100 }, { uid: 'b', at: 2, value: 90 }, { uid: 'c', at: 3, value: 150 }], answerIds: ['a', 'b', 'c'], hbLoaded: true }, { endGame() {} })
  assert.deepEqual(st.g.lastReveal.points, { a: 120, b: 70, c: 40 })
  assert.equal(mod.rules.parse(st, st.g.cur, '1 234,5'), 1234.5)
})

test('petit bac : 10 points par mot valide, 5 en double, 0 sans la bonne lettre', () => {
  const mod = MODULES.petitbac
  const st = { status: 'playing', settings: mod.defaultSettings(), players: { a: {}, b: {} }, scores: {}, found: {}, joinOrder: ['a', 'b'] }
  mod.start(st, 0)
  st.g.cur.prompt = { letter: 'B', categories: [{ id: 'animal', label: 'Animal' }, { id: 'pays', label: 'Pays' }] }
  const answers = [
    { uid: 'a', at: 1, value: { animal: 'Baleine', pays: 'Belgique' } },
    { uid: 'b', at: 2, value: { animal: 'baleine', pays: 'France' } },
  ]
  mod.tick(st, st.g.phaseEnd + 5000, { answers, answerIds: ['a', 'b'], hbLoaded: true }, { endGame() {} })
  assert.deepEqual(st.g.lastReveal.points, { a: 15, b: 5 })
  assert.equal(st.g.lastReveal.detail.b.answers.pays.ok, false)
})

test('réflexe : trop tôt = 0 point, temps de l’appareil borné par celui du serveur', () => {
  const mod = MODULES.reflexe
  const st = { status: 'playing', settings: mod.defaultSettings(), players: { a: {}, b: {}, c: {} }, scores: {}, found: {}, joinOrder: ['a', 'b', 'c'] }
  mod.start(st, 0)
  const cur = st.g.cur
  const at = cur.prompt.appearAt
  assert.deepEqual(mod.rules.parse(st, cur, { early: true }, at + 500), { early: true, ms: null })
  assert.deepEqual(mod.rules.parse(st, cur, { ms: 250 }, at - 1000), { early: true, ms: null })
  assert.equal(mod.rules.parse(st, cur, { ms: 260 }, at + 400).ms, 260)
  assert.equal(mod.rules.parse(st, cur, { ms: 5 }, at + 400).ms, 120, 'pas de temps irréaliste')
  assert.equal(mod.rules.parse(st, cur, { ms: 2000 }, at + 400).ms, 700, 'pas plus que ce que voit le serveur')
  assert.ok(mod.estimate(st.settings) > 0)
})

// ---------- v3 : améliorations des jeux ----------

import { nextSeries } from '../../server/async/games.js'
import { bacThreshold } from '../../server/games/live.js'

function liveRun(type, uids = ['a', 'b', 'c'], settings = {}) {
  const mod = MODULES[type]
  const st = { status: 'playing', settings: { ...mod.defaultSettings(), ...settings }, players: Object.fromEntries(uids.map((u) => [u, { pseudo: u }])), scores: {}, found: {}, joinOrder: [...uids] }
  mod.start(st, 0)
  return { mod, st }
}
const endQuestion = (mod, st, answers) => mod.tick(st, st.g.phaseEnd + 5000, { answers, answerIds: answers.map((a) => a.uid), hbLoaded: true }, { endGame() {} })

test('quiz : bonus de série (+10 par bonne réponse d’affilée, 30 au plus) et catégories choisies', () => {
  const { mod, st } = liveRun('quiz', ['a', 'b'], { cats: ['animaux'] })
  for (let r = 0; r < 4; r++) {
    assert.equal(st.g.cur.prompt.cat, 'animaux', 'seulement la catégorie choisie')
    const correct = st.g.cur.secret.correct
    endQuestion(mod, st, [
      { uid: 'a', at: st.g.phaseStart, value: correct },
      { uid: 'b', at: st.g.phaseStart, value: r === 1 ? (correct + 1) % 4 : correct },
    ])
    const d = st.g.lastReveal.detail
    assert.equal(d.a.bonus, [0, 10, 20, 30][r])
    assert.equal(st.g.lastReveal.points.a, 100 + [0, 10, 20, 30][r])
    if (r === 2) assert.equal(d.b.bonus, 0, 'la série de b repart de zéro après son erreur')
    mod.tick(st, st.g.phaseEnd + 1, {}, { endGame() {} })
  }
  assert.deepEqual(mod.sanitizeSettings({ cats: ['zzz'] }).cats, 'all')
  assert.deepEqual(mod.sanitizeSettings({ cats: ['geo', 'sport'] }).cats, ['geo', 'sport'])
})

test('réflexe : chat-piège — toucher = 0, garder son sang-froid = 40', () => {
  const { mod, st } = liveRun('reflexe', ['a', 'b', 'c'])
  st.g.cur.prompt.decoy = true
  endQuestion(mod, st, [{ uid: 'a', at: 1, value: { early: false, ms: 300 } }])
  assert.deepEqual(st.g.lastReveal.points, { a: 0, b: 40, c: 40 })
  assert.equal(st.g.lastReveal.detail.a.trap, true)
  assert.equal(st.g.lastReveal.detail.b.calm, true)
  let decoys = 0
  for (let i = 0; i < 400; i++) decoys += mod.rules.makeRound(st, 1 + (i % 7), 0).prompt.decoy ? 1 : 0
  assert.ok(decoys > 40 && decoys < 180, `environ un chat sur quatre (${decoys}/400)`)
  assert.equal(mod.rules.makeRound(st, 0, 0).prompt.decoy, false, 'jamais à la première manche')
})

test('petit bac : une réponse contestée par la majorité des autres est retirée (scores recalculés)', () => {
  const { mod, st } = liveRun('petitbac', ['a', 'b', 'c'])
  assert.equal(bacThreshold(st), 2)
  st.g.cur.prompt = { letter: 'B', categories: [{ id: 'animal', label: 'Animal' }, { id: 'pays', label: 'Pays' }] }
  endQuestion(mod, st, [
    { uid: 'a', at: 1, value: { animal: 'Blorp', pays: 'Belgique' } },
    { uid: 'b', at: 2, value: { animal: 'Baleine', pays: 'Brésil' } },
    { uid: 'c', at: 3, value: { animal: 'Bison', pays: 'Bolivie' } },
  ])
  assert.equal(st.scores.a, 20)
  assert.equal(st.g.phase, 'reveal')
  assert.equal(st.g.phaseEnd - st.g.phaseStart, 15000, 'vérification de 15 s')
  const votes = [
    { uid: 'b', targets: mod.rules.votes.sanitize(st, st.g, 'b', ['a:animal', 'b:pays', 'x:y']) },
    { uid: 'c', targets: ['a:animal'] },
  ]
  assert.deepEqual(votes[0].targets, ['a:animal'], 'on ne conteste ni soi-même ni une réponse inexistante')
  assert.deepEqual(mod.voteView(st, votes, 'b').tally, { 'a:animal': 2 })
  mod.tick(st, st.g.phaseEnd + 1, { votes }, { endGame() {} })
  assert.equal(st.scores.a, 10, '« Blorp » retiré')
  assert.equal(st.scores.b, 20)
  assert.equal(st.g.history[0].points.a, 10)
  assert.equal(st.g.phase, 'question', 'manche suivante')
  // Une seule voix sur deux : la réponse reste.
  const two = liveRun('petitbac', ['a', 'b', 'c'])
  two.st.g.cur.prompt = { letter: 'B', categories: [{ id: 'animal', label: 'Animal' }] }
  endQuestion(two.mod, two.st, [{ uid: 'a', at: 1, value: { animal: 'Blorp' } }])
  two.mod.tick(two.st, two.st.g.phaseEnd + 1, { votes: [{ uid: 'b', targets: ['a:animal'] }] }, { endGame() {} })
  assert.equal(two.st.scores.a, 10)
})

test('calcul express : calculs variés, toujours entiers, équations à trous', () => {
  const { mod, st } = liveRun('calcul', ['a', 'b'], { rounds: 15 })
  let eq = 0
  for (let i = 0; i < 600; i++) {
    const r = mod.rules.makeRound(st, i % 15, 0)
    assert.ok(Number.isInteger(r.secret.answer), r.prompt.text)
    if (r.prompt.eq) {
      eq++
      assert.match(r.prompt.text, /\?/)
      const [left, right] = r.prompt.text.split('=')
      const filled = left.replace('?', String(r.secret.answer)).replace('×', '*').replace('+', '+')
      assert.equal(Function(`return ${filled}`)(), Number(right), r.prompt.text)
    }
  }
  assert.ok(eq > 20, 'des équations à trous apparaissent')
})

test('mots mélangés : première lettre à 12 s, dernière à 21 s', () => {
  const { mod, st } = liveRun('anagramme', ['a', 'b'])
  const cur = st.g.cur
  const v0 = mod.view(st, 'a', st.g.phaseStart + 1000).prompt
  assert.equal(v0.first, undefined)
  const v1 = mod.view(st, 'a', st.g.phaseStart + 12500).prompt
  assert.ok(v1.first && !v1.last)
  const v2 = mod.view(st, 'a', st.g.phaseStart + 21500).prompt
  const plain = cur.secret.word.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}]/gu, '').toUpperCase()
  assert.equal(v2.last, plain.at(-1))
})

test('revanche : l’autre joueur commence, la série se cumule', () => {
  const first = make('morpion', u1, { opponent: u2 })
  for (const [uid, cell] of [[u1, 0], [u2, 3], [u1, 1], [u2, 4], [u1, 2]]) act(first, uid, { type: 'move', cell })
  const series = nextSeries(first.state)
  assert.deepEqual(series, { wins: { [u1]: 1 }, draws: 0, games: 1 })
  const mod = ASYNC_GAMES.morpion
  const init = mod.create({ uid: u2, room, lang: 'fr', now: 0, rematch: { players: [u2, u1], series } }, {})
  assert.deepEqual(init.players, [u2, u1])
  assert.equal(init.open, false)
  assert.deepEqual(init.data.series, series)
  const third = nextSeries({ data: { series }, result: { outcome: 'draw' } })
  assert.deepEqual(third, { wins: { [u1]: 1 }, draws: 1, games: 2 })
})

test('shifumi en 3 manches gagnantes', () => {
  const g = make('shifumi', u1, { opponent: u2, target: 3 })
  assert.equal(g.state.data.target, 3)
  for (let i = 0; i < 2; i++) {
    act(g, u1, { type: 'pick', choice: 'pierre' })
    act(g, u2, { type: 'pick', choice: 'ciseaux' })
  }
  assert.equal(g.state.status, 'open', '2 manches ne suffisent pas')
  act(g, u1, { type: 'pick', choice: 'pierre' })
  act(g, u2, { type: 'pick', choice: 'ciseaux' })
  assert.deepEqual(g.state.result, { outcome: 'win', winners: [u1] })
})

test('pendu : thème du mot surprise, difficulté, indice du mot choisi, détectives', () => {
  const g = make('pendu', u1, { difficulty: 'facile' })
  assert.ok(g.state.data.theme, 'le thème est connu')
  const custom = make('pendu', u1, { word: 'Chat', hint: 'Il miaule' })
  assert.equal(custom.mod.view(custom.state).hint, 'Il miaule')
  act(custom, u2, { type: 'letter', letter: 'c' })
  act(custom, u2, { type: 'letter', letter: 'h' })
  act(custom, u3, { type: 'letter', letter: 'z' })
  assert.deepEqual(custom.mod.view(custom.state).hits, { [u2]: 2 })
})

test('devine mon dessin : lettres offertes après 5, 10 et 15 essais', () => {
  const g = make('dessin', u1, { word: 'éléphant' })
  for (let i = 0; i < 4; i++) act(g, u2, { type: 'guess', text: `zz${i}` })
  assert.equal(g.mod.view(g.state, u2).hint.filter((c) => c.c).length, 0)
  assert.equal(g.mod.view(g.state, u2).nextHintAt, 5)
  act(g, u2, { type: 'guess', text: 'zzz' })
  assert.deepEqual(g.mod.view(g.state, u2).hint.filter((c) => c.c).map((c) => c.c), ['É'])
  for (let i = 0; i < 5; i++) act(g, u2, { type: 'guess', text: `yy${i}` })
  assert.equal(g.mod.view(g.state, u2).hint.filter((c) => c.c).length, 2)
  assert.equal(g.mod.view(g.state, u3).hint.filter((c) => c.c).length, 0, 'indices personnels')
})

test('tu préfères : vote anonyme, dilemmes récents évités', () => {
  const g = make('tupreferes', u1, { options: ['la mer', 'la montagne'], anonymous: true })
  act(g, u2, { type: 'vote', choice: 0 })
  const v = g.mod.view(g.state, u2)
  assert.deepEqual(v.counts, [1, 0])
  assert.equal(v.voters, null, 'on ne voit pas qui a voté quoi')
  const all = ASYNC_GAMES.tupreferes
  const ids = new Set()
  for (let i = 0; i < 30; i++) ids.add(all.create({ uid: u1, room, lang: 'fr', now: 0, recentDilemmas: ['d001', 'd002', 'd003'] }, {}).data.item)
  for (const id of ['d001', 'd002', 'd003']) assert.ok(!ids.has(id))
})

test('nombre mystère : chaud ou froid, essais de chacun', () => {
  const g = make('devine', u1, { max: 100 })
  const secret = g.state.data.secret
  const far = secret > 50 ? 1 : 100
  const res = act(g, u2, { type: 'guess', n: far })
  assert.equal(res.heat, 'froid')
  const near = secret < 100 ? secret + 1 : secret - 1
  assert.equal(act(g, u3, { type: 'guess', n: near }).heat, 'brulant')
  assert.deepEqual(g.mod.view(g.state).counts, { [u2]: 1, [u3]: 1 })
})
