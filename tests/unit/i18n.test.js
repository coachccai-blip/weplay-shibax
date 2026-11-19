// Traductions : mêmes clés et mêmes paramètres en français et en anglais, et chaque texte
// utilisé par l'interface (ou produit par le serveur) existe dans les deux langues.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import fr from '../../src/i18n/fr.js'
import en from '../../src/i18n/en.js'
import { GAME_CATALOG, THEME_IDS, DRAW_COLORS, BRUSHES, REACTION_IDS } from '../../shared/constants.js'
import { COATS, ACCESSORIES, BADGES, RANKS } from '../../shared/progression.js'

const root = path.resolve(import.meta.dirname, '../..')
const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

function sources(dir, ext = '.js') {
  const out = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) out.push(...sources(p, ext))
    else if (p.endsWith(ext)) out.push(p)
  }
  return out
}

test('le français et l’anglais ont exactement les mêmes clés', () => {
  const a = Object.keys(fr).sort()
  const b = Object.keys(en).sort()
  assert.deepEqual(a.filter((k) => !(k in en)), [], 'clés absentes de en.js')
  assert.deepEqual(b.filter((k) => !(k in fr)), [], 'clés absentes de fr.js')
})

test('chaque traduction garde les mêmes paramètres {…}', () => {
  for (const k of Object.keys(fr)) assert.deepEqual(params(en[k]), params(fr[k]), `paramètres différents pour ${k}`)
})

test('toutes les clés utilisées par l’interface existent', () => {
  const missing = []
  for (const f of sources(path.join(root, 'src'))) {
    if (f.includes(`${path.sep}i18n${path.sep}`) && /(fr|en)\.js$/.test(f)) continue
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\bt\(\s*'([\w.-]+)'/g)) if (!(m[1] in fr)) missing.push(m[1])
    for (const m of s.matchAll(/\btn\(\s*'([\w.-]+)'/g)) for (const form of ['one', 'other']) if (!(`${m[1]}.${form}` in fr)) missing.push(`${m[1]}.${form}`)
    for (const m of s.matchAll(/\bt\(\s*[^'`()]*\?\s*'([\w.-]+)'\s*:\s*'([\w.-]+)'/g)) for (const k of [m[1], m[2]]) if (!(k in fr)) missing.push(k)
  }
  assert.deepEqual([...new Set(missing)], [])
})

test('familles de clés construites dynamiquement', () => {
  const need = []
  for (const g of [...GAME_CATALOG.map((x) => x.id), 'test']) for (const p of ['name', 'tagline', 'rules']) need.push(`game.${g}.${p}`)
  for (const id of THEME_IDS) need.push(`theme.${id}`)
  for (const c of DRAW_COLORS) need.push(`color.${c.id}`)
  for (const b of BRUSHES) need.push(`brush.${b.id}`)
  for (const r of REACTION_IDS) need.push(`reaction.${r}`)
  for (const c of COATS) need.push(`coat.${c.id}`)
  for (const a of ACCESSORIES) need.push(`acc.${a.id}`)
  for (const b of BADGES) need.push(`badge.${b.id}.name`, `badge.${b.id}.desc`)
  for (const r of RANKS) need.push(`rank.${r.min}`)
  for (const k of ['finished', 'points', 'podium', 'firstOfDay', 'streak', 'asyncPlayed', 'asyncWon']) need.push(`xp.${k}`)
  for (const k of ['facile', 'moyen', 'difficile', 'perso']) need.push(`drawit.diff.${k}`)
  for (const k of ['found', 'time', 'skip', 'left']) need.push(`drawit.reason.${k}`)
  for (const k of ['length', 'chars', 'words', 'short']) need.push(`word.${k}`)
  for (const k of ['pierre', 'feuille', 'ciseaux']) need.push(`ag.shifumi.${k}`)
  for (const k of ['fr', 'en']) need.push(`lang.content.${k}`)
  const quiz = JSON.parse(fs.readFileSync(path.join(root, 'data/quiz.json'), 'utf8'))
  for (const cat of new Set(quiz.questions.map((q) => q.cat))) need.push(`quiz.cat.${cat}`)
  for (const k of ['created', 'join', 'leave', 'kick', 'host', 'rename', 'weekly']) need.push(`sys.${k}`)
  for (const k of ['win', 'winSolo', 'draw', 'team', 'lost', 'poll', 'over']) need.push(`async.result.${k}`)
  assert.deepEqual(need.filter((k) => !(k in fr) || !(k in en)), [])
})

test('chaque code d’erreur de l’API a un message traduit', () => {
  const codes = new Set()
  for (const f of [...sources(path.join(root, 'server')), ...sources(path.join(root, 'shared'))]) {
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\b[45]\d\d, '([a-z_]+)'/g)) codes.add(m[1])
  }
  assert.ok(codes.size > 40)
  assert.deepEqual([...codes].filter((c) => !(`err.${c}` in fr) || !(`err.${c}` in en)).sort(), [])
})
