// XP, niveaux, rangs, accessoires, série (brief : « Gamification »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalXpForLevel, levelFromXp, xpToNext, rankFor, unlockedAccessories, sanitizeAccessories, computeGameXp, computeAsyncXp, streakBonusPercent, currentStreak } from '../../shared/progression.js'
import { parisDay, parisWeek, previousWeek, dayDiff, addDays, weekLabel } from '../../shared/time.js'

test('niveaux : 100 XP pour le niveau 2, 1 800 XP cumulés pour le niveau 10', () => {
  assert.equal(xpToNext(1), 100)
  assert.equal(xpToNext(2), 125)
  assert.equal(totalXpForLevel(2), 100)
  assert.equal(totalXpForLevel(10), 1800)
  assert.equal(levelFromXp(0).level, 1)
  assert.equal(levelFromXp(99).level, 1)
  assert.equal(levelFromXp(100).level, 2)
  assert.equal(levelFromXp(1799).level, 9)
  assert.equal(levelFromXp(1800).level, 10)
  assert.equal(levelFromXp(150).into, 50)
  assert.equal(levelFromXp(150).needed, 125)
})

test('rangs et accessoires débloqués', () => {
  assert.equal(rankFor(1), 'Chiot')
  assert.equal(rankFor(4), 'Chiot')
  assert.equal(rankFor(5), 'Jeune shiba')
  assert.equal(rankFor(12), 'Shiba futé')
  assert.equal(rankFor(25), 'Shiba doré')
  assert.equal(rankFor(30), 'Shibax légendaire')
  assert.deepEqual(unlockedAccessories(4), [])
  assert.deepEqual(unlockedAccessories(5), ['bandana'])
  assert.deepEqual(unlockedAccessories(15), ['bandana', 'lunettes', 'beret'])
  assert.deepEqual(unlockedAccessories(30), ['bandana', 'lunettes', 'beret', 'echarpe', 'couronne'])
  // Un seul accessoire par emplacement, uniquement s'il est débloqué.
  assert.deepEqual(sanitizeAccessories(['couronne', 'bandana'], 10), ['bandana'])
  assert.deepEqual(sanitizeAccessories(['bandana', 'echarpe'], 20), ['echarpe'])
})

test('XP d’une partie : terminée, points, podium, première du jour, série', () => {
  const xp = computeGameXp({ valid: true, finished: true, points: 345, rank: 1, firstGameOfDay: true, streak: 1 })
  assert.equal(xp.total, 20 + 34 + 30 + 15)
  const second = computeGameXp({ valid: true, finished: true, points: 99, rank: 2, firstGameOfDay: false, streak: 1 })
  assert.equal(second.total, 20 + 9 + 20)
  const third = computeGameXp({ valid: true, finished: true, points: 0, rank: 3, firstGameOfDay: false, streak: 1 })
  assert.equal(third.total, 30)
})

test('bonus de série : +10 % par jour consécutif, plafonné à +50 %', () => {
  assert.equal(streakBonusPercent(1), 0)
  assert.equal(streakBonusPercent(2), 10)
  assert.equal(streakBonusPercent(6), 50)
  assert.equal(streakBonusPercent(30), 50)
  const xp = computeGameXp({ valid: true, finished: true, points: 0, rank: 4, firstGameOfDay: false, streak: 3 })
  assert.equal(xp.total, 20 + 4) // 20 × 1,2
})

test('XP des jeux dans la conversation : participation, victoire, lignes traduisibles', () => {
  const x = computeAsyncXp({ played: true, won: true, firstGameOfDay: false, streak: 1 })
  assert.equal(x.total, 15)
  assert.deepEqual(x.lines.map((l) => l.key), ['asyncPlayed', 'asyncWon'])
  assert.equal(computeAsyncXp({ played: false }).total, 0)
  const g = computeGameXp({ valid: true, finished: true, points: 120, rank: 2, firstGameOfDay: true, streak: 2 })
  assert.deepEqual(g.lines.map((l) => l.key), ['finished', 'points', 'podium', 'firstOfDay', 'streak'])
})

test('une partie de moins de 3 manches ne rapporte pas d’XP', () => {
  assert.equal(computeGameXp({ valid: false, finished: true, points: 500, rank: 1, firstGameOfDay: true, streak: 5 }).total, 0)
})

test('série affichée : remise à zéro après un jour manqué', () => {
  assert.equal(currentStreak({ count: 4, last: '2026-11-18' }, 1), 4)
  assert.equal(currentStreak({ count: 4, last: '2026-11-17' }, 2), 0)
})

test('jours et semaines à l’heure de Paris', () => {
  // 23 h 30 UTC le 19 novembre = 0 h 30 le 20 à Paris (heure d'hiver).
  assert.equal(parisDay(Date.UTC(2026, 10, 19, 23, 30)), '2026-11-20')
  // 22 h 30 UTC le 1er juillet = 0 h 30 le 2 à Paris (heure d'été).
  assert.equal(parisDay(Date.UTC(2026, 6, 1, 22, 30)), '2026-07-02')
  // Semaine du lundi au dimanche.
  assert.equal(parisWeek(Date.UTC(2026, 10, 19, 12)), '2026-11-16') // jeudi
  assert.equal(parisWeek(Date.UTC(2026, 10, 22, 22, 59)), '2026-11-16') // dimanche 23 h 59 à Paris
  assert.equal(parisWeek(Date.UTC(2026, 10, 22, 23, 1)), '2026-11-23') // lundi 0 h 01 à Paris
  assert.equal(previousWeek('2026-11-23'), '2026-11-16')
  assert.equal(dayDiff('2026-10-24', '2026-10-26'), 2) // changement d'heure
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(weekLabel('2026-11-16'), 'du 16 au 22 novembre')
  assert.equal(weekLabel('2026-11-30'), 'du 30 novembre au 6 décembre')
})
