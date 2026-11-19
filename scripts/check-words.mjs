// Vérifie la banque de mots : 300 entrées, 6 thèmes × 3 difficultés, sans doublon ni terme interdit.
import { readFileSync } from 'node:fs'
import { compactWord } from '../shared/text.js'
import { containsBanned } from '../shared/moderation.js'
import { THEME_IDS } from '../shared/constants.js'
import { DIFFICULTIES } from '../shared/scoring.js'

const bank = JSON.parse(readFileSync(new URL('../data/mots.json', import.meta.url), 'utf8'))
const errors = []
const seen = new Map()
let total = 0

for (const theme of THEME_IDS) {
  const t = bank.themes[theme]
  if (!t) {
    errors.push(`Thème manquant : ${theme}`)
    continue
  }
  for (const diff of DIFFICULTIES) {
    const list = t[diff] || []
    if (list.length < 10) errors.push(`${theme}/${diff} : seulement ${list.length} mots`)
    for (const entry of list) {
      total++
      for (const variant of entry.split('|')) {
        const key = compactWord(variant)
        if (!key) errors.push(`Entrée vide dans ${theme}/${diff}`)
        if (containsBanned(variant)) errors.push(`Terme interdit : ${variant}`)
        if (seen.has(key)) errors.push(`Doublon : « ${variant} » (${theme}/${diff} et ${seen.get(key)})`)
        seen.set(key, `${theme}/${diff}`)
      }
    }
  }
}

if (total !== 300) errors.push(`La banque compte ${total} mots au lieu de 300`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Banque de mots valide : ${total} mots, ${THEME_IDS.length} thèmes.`)
