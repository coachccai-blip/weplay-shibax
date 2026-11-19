// Comparaison des mots de Draw It (brief : « Les propositions », « Le mot »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWord, compactWord, judgeGuess, validateCustomWord, graphemeLength, hintPattern, levenshtein, cleanMessage } from '../../shared/text.js'

test('la comparaison ignore majuscules, accents, traits d’union, apostrophes et espaces en trop', () => {
  assert.equal(judgeGuess('arc en ciel', 'Arc-en-ciel'), 'correct')
  assert.equal(judgeGuess('ARC-EN-CIEL', 'arc-en-ciel'), 'correct')
  assert.equal(judgeGuess('  éléphant  ', 'ELEPHANT'), 'correct')
  assert.equal(judgeGuess('Elephant', 'éléphant'), 'correct')
  assert.equal(judgeGuess('s etirer', 's’étirer'), 'correct')
  assert.equal(judgeGuess("S'ÉTIRER", 's’étirer'), 'correct')
  assert.equal(judgeGuess('pomme   de    terre', 'pomme de terre'), 'correct')
  assert.equal(judgeGuess('oeuf', 'œuf'), 'correct')
  assert.equal(judgeGuess('Œuf', 'oeuf'), 'correct')
})

test('les variantes de la banque de mots sont acceptées', () => {
  assert.equal(judgeGuess('boulangère', ['boulanger', 'boulangère']), 'correct')
  assert.equal(judgeGuess('poulpe', ['pieuvre', 'poulpe']), 'correct')
})

test('une proposition qui contient le mot sans lui être égale est masquée', () => {
  assert.equal(judgeGuess('un chat', 'chat'), 'masked')
  assert.equal(judgeGuess('chats', 'chat'), 'masked')
  assert.equal(judgeGuess('lechatnoir', 'chat'), 'masked')
})

test('à une lettre près pour un mot de 5 lettres ou plus : « Tu chauffes ! »', () => {
  assert.equal(judgeGuess('elephan', 'éléphant'), 'close') // lettre manquante
  assert.equal(judgeGuess('girafes', 'girafe'), 'masked') // contient le mot : masquée en priorité
  assert.equal(judgeGuess('girage', 'girafe'), 'close') // lettre remplacée
  assert.equal(judgeGuess('gireafe', 'girafe'), 'close') // lettre en trop
  assert.equal(judgeGuess('chut', 'chat'), 'wrong') // moins de 5 lettres : pas d'indice
  assert.equal(judgeGuess('girofle', 'girafe'), 'wrong') // deux lettres d'écart
})

test('les autres propositions sont simplement fausses', () => {
  assert.equal(judgeGuess('chien', 'chat'), 'wrong')
  assert.equal(judgeGuess('', 'chat'), 'wrong')
  assert.equal(judgeGuess('!!!', 'chat'), 'wrong')
})

test('normalisation et distance d’édition', () => {
  assert.equal(normalizeWord('  L’Arc-en-Ciel !  '), 'l arc en ciel')
  assert.equal(compactWord('Barbe à papa'), 'barbeapapa')
  assert.equal(levenshtein('chat', 'chat'), 0)
  assert.equal(levenshtein('chat', 'chats'), 1)
  assert.equal(levenshtein('kitten', 'sitting'), 3)
})

test('mot perso : 2 à 25 caractères, trois mots au plus, lettres, espaces, traits d’union, apostrophes', () => {
  assert.equal(validateCustomWord('Arc-en-ciel').ok, true)
  assert.equal(validateCustomWord('pomme de terre').ok, true)
  assert.equal(validateCustomWord("l'été").ok, true)
  assert.equal(validateCustomWord('é').ok, false)
  assert.equal(validateCustomWord('a'.repeat(26)).ok, false)
  assert.equal(validateCustomWord('un deux trois quatre').ok, false)
  assert.equal(validateCustomWord('chat2').ok, false)
  assert.equal(validateCustomWord('chat!').ok, false)
  assert.equal(validateCustomWord('-chat').ok, false)
})

test('indice : une case par lettre, espaces et traits d’union visibles', () => {
  const p = hintPattern('arc-en ciel')
  assert.equal(p.map((x) => x.t).join(''), 'llldllsllll')
  assert.equal(p.filter((x) => x.t === 'l').length, 9)
})

test('longueur d’un message : un emoji compte pour un caractère', () => {
  assert.equal(graphemeLength('👨‍👩‍👧'), 1)
  assert.equal(graphemeLength('Salut 🐶'), 7)
  assert.equal(cleanMessage('a\n\n\n\n\nb'), 'a\n\n\nb')
})
