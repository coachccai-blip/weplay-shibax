// Liste de mots interdits (pseudos, noms de salon, mots perso).
// « word » : refusé s'il apparaît comme mot entier ; « part » : refusé s'il apparaît n'importe où
// (réservé aux termes sans risque de faux positif, pour attraper « s.a.l.o.p.e » ou « Putaindechat »).

const WORD = [
  'con', 'cons', 'conne', 'connes', 'pd', 'pede', 'pedes', 'pute', 'putes', 'bite', 'bites', 'cul', 'chier',
  'nique', 'niquer', 'ntm', 'fdp', 'tg', 'ta gueule', 'suce', 'sucer', 'chatte', 'teub', 'zob', 'sexe', 'sexy',
  'salope', 'salopes', 'porn', 'viol', 'violer', 'nazi', 'nazis', 'hitler', 'kkk', 'daech', 'fuck', 'shit', 'dick',
  'cock', 'cunt', 'bitch', 'fag', 'whore', 'slut', 'pussy', 'tapette', 'gouine', 'negre', 'negro', 'bicot',
  'bamboula', 'chinetoque', 'feuj', 'gogol', 'triso', 'kill', 'suicide',
]

const PART = [
  'connard', 'connasse', 'salaud', 'putain', 'encule', 'batard', 'merde', 'branleur', 'branler', 'branlette',
  'foutre', 'couille', 'petasse', 'pouffiasse', 'trouduc', 'enfoire', 'bougnoul', 'youpin', 'negresse', 'nigger',
  'nigga', 'faggot', 'motherfuck', 'fucker', 'fucking', 'porno', 'pedophil', 'zoophil', 'niquetamere', 'tamere',
  'siegheil', 'heilhitler', 'terroris', 'jihad',
]

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '€': 'e', '!': 'i', '|': 'i' }

function strip(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[013457@$€!|]/g, (c) => LEET[c] || c)
}

const WORD_SET = WORD.map((w) => strip(w))
const PART_SET = PART.map((w) => strip(w).replace(/[^a-z]/g, ''))

/** Vrai si le texte contient un terme interdit. */
export function containsBanned(text) {
  const s = strip(text)
  const spaced = ` ${s.replace(/[^a-z]+/g, ' ').trim()} `
  for (const w of WORD_SET) {
    if (spaced.includes(` ${w} `)) return true
  }
  const compact = s.replace(/[^a-z]/g, '')
  for (const w of PART_SET) {
    if (w && compact.includes(w)) return true
  }
  return false
}
