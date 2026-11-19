// Identifiants, modération, banque de mots.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { newUserId, newLoginKey, newInviteCode, newRoomId, newGameId, normalizeUserIdInput, USER_ID_RE, KEY_RE, INVITE_RE, ROOM_ID_RE, GAME_ID_RE } from '../../shared/ids.js'
import { containsBanned } from '../../shared/moderation.js'
import { randomPseudo } from '../../shared/names.js'
import { compactWord } from '../../shared/text.js'
import { THEME_IDS } from '../../shared/constants.js'

test('identifiant SHX- + 6 caractères sans 0, O, 1 ni I ; clé de 12 caractères', () => {
  for (let i = 0; i < 500; i++) {
    const id = newUserId()
    assert.match(id, USER_ID_RE)
    assert.doesNotMatch(id.slice(4), /[01OI]/)
    assert.match(newLoginKey(), KEY_RE)
    assert.match(newInviteCode(), INVITE_RE)
    assert.match(newRoomId(), ROOM_ID_RE)
    assert.match(newGameId(), GAME_ID_RE)
  }
  assert.equal(normalizeUserIdInput('shx abc 234'), 'SHX-ABC234')
  assert.equal(normalizeUserIdInput('ABC234'), 'SHX-ABC234')
})

test('pseudos tirés au sort : 3 à 16 caractères, jamais interdits', () => {
  for (let i = 0; i < 300; i++) {
    const p = randomPseudo()
    assert.ok(p.length >= 3 && p.length <= 16, p)
    assert.equal(containsBanned(p), false, p)
  }
})

test('mots interdits : détectés, y compris déguisés, sans faux positifs courants', () => {
  for (const bad of ['connard', 'Gros con', 'S4L0P3', 'p.u.t.a.i.n', 'Enculé', 'pédé', 'nique ta mère']) assert.equal(containsBanned(bad), true, bad)
  for (const ok of ['Constant', 'Salopette', 'Encyclopédie', 'Grenouille', 'Chatouille', 'Habite', 'Technique', 'Dispute', 'Fichier', 'Culture', 'Mochi Malicieux'])
    assert.equal(containsBanned(ok), false, ok)
  for (const ok of ['un pique-nique sur la Lune', 'pique-niquer au parc', 'une rue en cul-de-sac', 'chili con carne']) assert.equal(containsBanned(ok), false, ok)
  assert.equal(containsBanned('nique ta mère'), true)
})

for (const file of ['mots.json', 'words-en.json']) {
  test(`banque de mots ${file} : 300 mots, 6 thèmes × 3 difficultés, sans doublon ni terme interdit`, () => {
    const bank = JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), 'utf8'))
    let total = 0
    const seen = new Set()
    for (const theme of THEME_IDS) {
      for (const diff of ['facile', 'moyen', 'difficile']) {
        const list = bank.themes[theme][diff]
        assert.ok(list.length >= 15, `${theme}/${diff}`)
        for (const entry of list) {
          total++
          for (const v of entry.split('|')) {
            const k = compactWord(v)
            assert.ok(!seen.has(k), `doublon : ${v}`)
            seen.add(k)
            assert.equal(containsBanned(v), false, v)
          }
        }
      }
    }
    assert.equal(total, 300)
  })
}

test('contenus des jeux : quiz, estimations, dilemmes et Petit Bac complets dans les deux langues', () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), 'utf8'))
  const quiz = read('quiz.json').questions
  assert.ok(quiz.length >= 50)
  for (const q of quiz) for (const l of ['fr', 'en']) {
    assert.ok(q[l].q.length > 5, q.id)
    assert.equal(new Set(q[l].a).size, 4, `${q.id} : 4 réponses distinctes`)
  }
  const est = read('estimations.json').questions
  assert.ok(est.length >= 30)
  for (const q of est) assert.ok(Number.isFinite(q.answer) && q.answer >= 0 && q.fr.q && q.en.q, q.id)
  const dil = read('dilemmas.json').items
  assert.ok(dil.length >= 40)
  for (const d of dil) for (const l of ['fr', 'en']) assert.ok(d[l].length === 2 && d[l].every((x) => x.length >= 2 && !containsBanned(x)), d.id)
  const bac = read('petitbac.json')
  assert.ok(bac.categories.length >= 10)
  for (const c of bac.categories) assert.ok(c.fr && c.en, c.id)
  for (const l of ['fr', 'en']) assert.ok(/^[A-Z]{15,}$/.test(bac.letters[l]))
})
