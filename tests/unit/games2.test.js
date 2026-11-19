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
