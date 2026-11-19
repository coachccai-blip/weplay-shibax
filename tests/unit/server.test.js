// Règles serveur de Draw It (simulation pure des transitions) et écritures concurrentes dans Blobs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStore } from './memory-store.js'
import { Db, SKIP } from '../../server/db.js'
import { K } from '../../server/keys.js'
import { MODULES, tickGame, gameView } from '../../server/games/index.js'
import { applyPlayerRewards, finishSideEffects } from '../../server/rewards.js'
import { DRAWIT } from '../../shared/constants.js'

const drawit = MODULES.drawit

function newState(uids, now, settings = {}) {
  const players = {}
  for (const id of uids) players[id] = { id, pseudo: id, coat: 'roux', acc: [], joinedAt: now - 60000, left: false }
  return {
    id: '20261119-abcdefghjk',
    type: 'drawit',
    rid: 'abcdefghjk',
    status: 'playing',
    v: 1,
    createdAt: now - 60000,
    hostId: uids[0],
    lobbyExpiresAt: now + 600000,
    settings: drawit.sanitizeSettings({ tours: 1, drawTime: 60, ...settings }),
    players,
    joinOrder: [...uids],
    scores: {},
    found: {},
    g: null,
  }
}

const present = (uids, now) => ({ hb: Object.fromEntries(uids.map((u) => [u, now])), hbLoaded: true, foundIds: [], founds: [], first: null })

test('Draw It : déroulé complet d’une partie (choix auto du mot facile, tous trouvent, dessinateur suivant, fin)', () => {
  let now = 1_800_000_000_000
  const uids = ['SHX-AAAAAA', 'SHX-BBBBBB', 'SHX-CCCCCC']
  const state = newState(uids, now)
  drawit.start(state, now, present(uids, now), { endGame: () => {} })
  const g = state.g
  assert.equal(g.phase, 'choosing')
  assert.equal(g.round, 0)
  assert.equal(g.choices.length, 3)
  assert.deepEqual(g.choices.map((c) => c.difficulty), ['facile', 'moyen', 'difficile'])
  const order = [...g.order]
  assert.equal(g.drawerId, order[0])

  // Sans choix à l'échéance, le mot facile est retenu.
  const easy = g.choices[0].display
  now += DRAWIT.chooseMs + 10
  assert.equal(tickGame(state, now, present(uids, now)), true)
  assert.equal(state.g.phase, 'drawing')
  assert.equal(state.g.word.display, easy)

  // Le mot n'est jamais dans la vue d'un devineur, seulement dans celle du dessinateur.
  const guesser = order[1]
  const vg = JSON.stringify(gameView(state, guesser, now))
  assert.ok(!vg.toLowerCase().includes(easy.toLowerCase()), 'le mot a fuité')
  assert.ok(JSON.stringify(gameView(state, order[0], now)).includes(easy))

  // Tous les devineurs trouvent : fin de manche, points, premier = bonus.
  const start = state.g.phaseStart
  now = start + 45000
  const facts = present(uids, now)
  facts.foundIds = [order[1], order[2]]
  facts.founds = [
    { uid: order[1], at: start + 30000 },
    { uid: order[2], at: start + 45000 },
  ]
  facts.first = { uid: order[1] }
  assert.equal(tickGame(state, now, facts), true)
  assert.equal(state.g.phase, 'reveal')
  assert.equal(state.g.last.reason, 'found')
  assert.equal(state.g.last.word, easy)
  assert.equal(state.scores[order[1]], 85) // 65 + 20 de bonus, mot facile ×1
  assert.equal(state.scores[order[2]], 48)
  assert.equal(state.scores[order[0]], 100) // 2 sur 2

  // Après la révélation, le dessinateur suivant (ordre tiré au lancement).
  now += DRAWIT.revealMs + 10
  assert.equal(tickGame(state, now, present(uids, now)), true)
  assert.equal(state.g.phase, 'choosing')
  assert.equal(state.g.drawerId, order[1])
  assert.equal(state.g.round, 1)

  // Les deux manches suivantes passent sans réponse (temps écoulé).
  for (let r = 1; r < 3; r++) {
    now += DRAWIT.chooseMs + 10
    tickGame(state, now, present(uids, now))
    assert.equal(state.g.phase, 'drawing')
    now += state.g.drawMs + 10
    tickGame(state, now, present(uids, now))
    assert.equal(state.g.last.reason, 'time')
    now += DRAWIT.revealMs + 10
    tickGame(state, now, present(uids, now))
  }
  assert.equal(state.status, 'finished')
  assert.equal(state.results.played, 3)
  assert.equal(state.results.valid, true)
  assert.equal(state.results.ranking[0].uid, order[0])
  // Un mot ne revient pas dans la même partie.
  assert.equal(new Set(state.g.used).size, state.g.used.length)
})

test('Draw It : dessinateur injoignable 10 s → la manche se termine sans points pour lui', () => {
  let now = 1_800_000_000_000
  const uids = ['SHX-AAAAAA', 'SHX-BBBBBB', 'SHX-CCCCCC']
  const state = newState(uids, now)
  drawit.start(state, now, present(uids, now), { endGame: () => {} })
  const drawer = state.g.drawerId
  now += 1000
  assert.equal(drawit.tick(state, now, present(uids, now), {}), false) // rien à faire
  // Le mot facile est retenu à l'échéance, puis le dessinateur disparaît.
  now += DRAWIT.chooseMs + 10
  tickGame(state, now, present(uids, now))
  assert.equal(state.g.phase, 'drawing')
  const others = uids.filter((u) => u !== drawer)
  now += 11000
  const later = { hb: Object.fromEntries(others.map((u) => [u, now])), hbLoaded: true, foundIds: [], founds: [], first: null }
  later.hb[drawer] = now - 11000
  for (const p of Object.values(state.players)) p.joinedAt = now - 120000
  assert.equal(tickGame(state, now, later), true)
  assert.equal(state.g.phase, 'reveal')
  assert.equal(state.g.last.reason, 'left')
  assert.equal(state.scores[drawer] || 0, 0)
})

test('Draw It : un joueur absent est sauté, un nouveau venu joue en fin de rotation', () => {
  let now = 1_800_000_000_000
  const uids = ['SHX-AAAAAA', 'SHX-BBBBBB', 'SHX-CCCCCC']
  const state = newState(uids, now)
  for (const p of Object.values(state.players)) p.joinedAt = now - 120000
  drawit.start(state, now, present(uids, now), { endGame: () => {} })
  const order = [...state.g.order]
  // Arrivée en cours de partie.
  state.players['SHX-DDDDDD'] = { id: 'SHX-DDDDDD', pseudo: 'D', coat: 'roux', acc: [], joinedAt: now, left: false, late: true }
  state.joinOrder.push('SHX-DDDDDD')
  drawit.onLateJoin(state, 'SHX-DDDDDD')
  assert.equal(state.g.order.at(-1), 'SHX-DDDDDD')
  assert.equal(state.players['SHX-DDDDDD'].fromRound, 1)
  // Le 2e de l'ordre est absent au moment de dessiner : son tour est sauté.
  now += DRAWIT.chooseMs + 10
  tickGame(state, now, present([...uids, 'SHX-DDDDDD'], now))
  now += state.g.drawMs + 10
  tickGame(state, now, present([...uids, 'SHX-DDDDDD'], now))
  now += DRAWIT.revealMs + 10
  const facts = present([...uids, 'SHX-DDDDDD'], now)
  facts.hb[order[1]] = now - 60000
  tickGame(state, now, facts)
  assert.equal(state.g.drawerId, order[2])
})

test('Draw It : s’il ne reste qu’un joueur actif, la partie se termine sur les points acquis', () => {
  let now = 1_800_000_000_000
  const uids = ['SHX-AAAAAA', 'SHX-BBBBBB']
  const state = newState(uids, now)
  for (const p of Object.values(state.players)) p.joinedAt = now - 120000
  drawit.start(state, now, present(uids, now), { endGame: () => {} })
  state.scores['SHX-AAAAAA'] = 120
  now += 40000
  const facts = { hb: { 'SHX-AAAAAA': now, 'SHX-BBBBBB': now - 40000 }, hbLoaded: true, foundIds: [], founds: [], first: null }
  assert.equal(tickGame(state, now, facts), true)
  assert.equal(state.status, 'finished')
  assert.equal(state.endReason, 'not_enough')
  assert.equal(state.results.ranking[0].score, 120)
})

test('Blobs : 40 mises à jour concurrentes sur le même document, aucune perdue', async () => {
  const db = new Db(new MemoryStore())
  await Promise.all(
    Array.from({ length: 40 }, () =>
      db.mutate('compteur', (d) => {
        d.n = (d.n || 0) + 1
      }, { create: () => ({ n: 0 }), attempts: 60 }),
    ),
  )
  assert.equal((await db.get('compteur')).n, 40)
})

test('Blobs : création conditionnelle, un seul gagnant', async () => {
  const db = new Db(new MemoryStore())
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => db.create('premier', { i })))
  assert.equal(res.filter(Boolean).length, 1)
  const skipped = await db.mutate('premier', () => SKIP)
  assert.equal(skipped.changed, false)
})

test('Récompenses : rejouer la fin de partie n’attribue pas l’XP deux fois', async () => {
  const db = new Db(new MemoryStore())
  const now = Date.UTC(2026, 10, 19, 15)
  const uids = ['SHX-AAAAAA', 'SHX-BBBBBB', 'SHX-CCCCCC']
  for (const id of uids) {
    await db.create(K.user(id), { id, pseudo: id, coat: 'roux', acc: [], xp: 0, level: 1, badges: {}, stats: { games: 0, wins: 0, msgs: 0, found: 0, drawn: 0 }, streak: { count: 0, last: null }, applied: [], recent: {} })
  }
  await db.create(K.room('abcdefghjk'), { id: 'abcdefghjk', members: uids.map((id) => ({ id, joinedAt: now })), game: { id: '20261119-abcdefghjk' } })
  const state = newState(uids, now)
  state.status = 'finished'
  state.endedAt = now
  state.g = { played: 3, rounds: [], facts: {} }
  state.results = {
    valid: true,
    played: 3,
    drawings: [],
    ranking: [
      { uid: uids[0], score: 300, found: 2, rank: 1 },
      { uid: uids[1], score: 200, found: 1, rank: 2 },
      { uid: uids[2], score: 100, found: 1, rank: 3 },
    ],
  }
  await db.create(K.game(state.id), state)
  const first = await applyPlayerRewards(db, state, state.results.ranking[0], drawit)
  const again = await applyPlayerRewards(db, state, state.results.ranking[0], drawit)
  assert.deepEqual(again, first)
  const user = await db.get(K.user(uids[0]))
  assert.equal(user.xp, first.xp)
  assert.equal(first.xp, 20 + 30 + 30 + 15)
  assert.ok(user.badges.premiere_patte)
  assert.equal(user.streak.count, 1)
  // Les effets de fin de partie complets, rejoués : classement du salon compté une seule fois.
  await finishSideEffects(db, state, drawit)
  await finishSideEffects(db, { ...state, rewardsDone: false, endedAt: now - 30000 }, drawit)
  const lb = await db.get(K.lbAll('abcdefghjk'))
  assert.equal(lb.xp[uids[0]], first.xp)
  const final = await db.get(K.user(uids[0]))
  assert.equal(final.xp, first.xp)
  assert.equal((await db.get(K.game(state.id))).rewardsDone, true)
  assert.equal((await db.get(K.room('abcdefghjk'))).game, null)
})
