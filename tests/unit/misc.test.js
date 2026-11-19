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
})

test('banque de mots : 300 mots, 6 thèmes × 3 difficultés, sans doublon ni terme interdit', () => {
  const bank = JSON.parse(readFileSync(new URL('../../data/mots.json', import.meta.url), 'utf8'))
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
