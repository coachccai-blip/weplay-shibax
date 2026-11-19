// Barème de Draw It (brief : « Le score »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guesserPoints, drawerPoints, roundPoints, rankPlayers, MULTIPLIERS, FIRST_FINDER_BONUS } from '../../shared/scoring.js'

test('devineur : 100 points à la première seconde, 30 à la dernière, 65 à mi-temps', () => {
  assert.equal(guesserPoints(60000, 60000), 100)
  assert.equal(guesserPoints(0, 60000), 30)
  assert.equal(guesserPoints(30000, 60000), 65)
  assert.equal(guesserPoints(-5000, 60000), 30)
  // Baisse régulière, arrondie à l'entier le plus proche : 30 + 70 × 45/60 = 82,5 → 83.
  assert.equal(guesserPoints(45000, 60000), 83)
  assert.equal(guesserPoints(15000, 45000), Math.round(30 + 70 / 3))
})

test('dessinateur : 100 points × part des devineurs qui ont trouvé (3 sur 4 → 75)', () => {
  assert.equal(drawerPoints(3, 4), 75)
  assert.equal(drawerPoints(4, 4), 100)
  assert.equal(drawerPoints(0, 4), 0)
  assert.equal(drawerPoints(1, 3), 33)
  assert.equal(drawerPoints(0, 0), 0)
})

test('multiplicateurs : facile et perso ×1, moyen ×1,25, difficile ×1,5', () => {
  assert.equal(MULTIPLIERS.facile, 1)
  assert.equal(MULTIPLIERS.perso, 1)
  assert.equal(MULTIPLIERS.moyen, 1.25)
  assert.equal(MULTIPLIERS.difficile, 1.5)
})

test('manche : bonus de 20 au premier, multiplicateur appliqué à tous les points', () => {
  const drawStart = 1_000_000
  const pts = roundPoints({
    finds: [
      { uid: 'A', at: drawStart + 30000 }, // mi-temps : 65 + 20 de bonus
      { uid: 'B', at: drawStart + 45000 },
    ],
    firstId: 'A',
    drawerId: 'D',
    guesserCount: 4,
    drawStart,
    drawMs: 60000,
    difficulty: 'difficile',
  })
  assert.equal(FIRST_FINDER_BONUS, 20)
  assert.equal(pts.A, Math.round((65 + 20) * 1.5)) // 128
  assert.equal(pts.B, Math.round(48 * 1.5)) // 30 + 70×15/60 = 47,5 → 48 ; ×1,5 = 72
  assert.equal(pts.D, Math.round(50 * 1.5)) // 2 sur 4 → 50 ; ×1,5 = 75
})

test('le dessinateur qui passe ou s’en va ne marque rien ; les devineurs gardent leurs points', () => {
  const pts = roundPoints({
    finds: [{ uid: 'A', at: 10_000 }],
    firstId: 'A',
    drawerId: 'D',
    guesserCount: 2,
    drawStart: 0,
    drawMs: 60000,
    difficulty: 'facile',
    drawerScores: false,
  })
  assert.equal(pts.D, 0)
  assert.ok(pts.A > 0)
})

test('égalité finale : départagée par les mots trouvés, puis rang partagé', () => {
  const ranking = rankPlayers([
    { uid: 'a', score: 300, found: 3 },
    { uid: 'b', score: 300, found: 4 },
    { uid: 'c', score: 200, found: 2 },
    { uid: 'd', score: 200, found: 2 },
    { uid: 'e', score: 100, found: 1 },
  ])
  assert.deepEqual(
    ranking.map((r) => [r.uid, r.rank]),
    [
      ['b', 1],
      ['a', 2],
      ['c', 3],
      ['d', 3],
      ['e', 5],
    ],
  )
})
