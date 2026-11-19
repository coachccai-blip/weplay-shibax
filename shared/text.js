// Comparaison des mots de Draw It et validation des textes.

/**
 * Forme normalisée d'un mot : minuscules, sans accents ni ligatures,
 * traits d'union / apostrophes / ponctuation remplacés par des espaces,
 * espaces en trop supprimés.
 * « Arc-en-ciel » → « arc en ciel », « Œuf » → « oeuf ».
 */
export function normalizeWord(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Forme compacte : normalisée puis sans aucun espace. */
export function compactWord(input) {
  return normalizeWord(input).replace(/ /g, '')
}

/** Distance d'édition (Levenshtein) entre deux chaînes. */
export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

/** Nombre de lettres (hors espaces, traits d'union, apostrophes). */
export function letterCount(word) {
  return compactWord(word).length
}

/**
 * Analyse une proposition face au mot secret (et ses variantes acceptées).
 * Retourne 'correct' | 'masked' | 'close' | 'wrong'.
 *  - correct : égale au mot, en ignorant majuscules, accents, traits d'union,
 *    apostrophes et espaces en trop ;
 *  - masked  : contient le mot sans lui être égale (cachée aux autres) ;
 *  - close   : à une lettre près, pour un mot de 5 lettres ou plus (« Tu chauffes ! ») ;
 *  - wrong   : autre proposition, visible de tous.
 */
export function judgeGuess(guess, answers) {
  const list = (Array.isArray(answers) ? answers : [answers]).map(compactWord).filter(Boolean)
  const g = compactWord(guess)
  if (!g || !list.length) return 'wrong'
  if (list.includes(g)) return 'correct'
  if (list.some((w) => g.includes(w))) return 'masked'
  if (list.some((w) => w.length >= 5 && levenshtein(g, w) === 1)) return 'close'
  return 'wrong'
}

/** Nombre de caractères perçus (graphèmes), pour compter un emoji comme un caractère. */
export function graphemeLength(text) {
  const s = String(text ?? '')
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0
    for (const _ of new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s)) n++
    return n
  }
  return Array.from(s).length
}

/** Nettoie une saisie sur une ligne : supprime caractères de contrôle et espaces multiples. */
export function cleanLine(input) {
  return String(input ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nettoie un message : garde les retours à la ligne (3 au plus d'affilée). */
export function cleanMessage(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

/**
 * Valide un mot perso : 2 à 25 caractères, trois mots au plus,
 * uniquement lettres, espaces, traits d'union et apostrophes.
 * Retourne { ok, value, error, code } (code : length | chars | words | short, traduit par l'interface).
 */
export function validateCustomWord(input) {
  const value = cleanLine(input).replace(/’/g, "'")
  const len = Array.from(value).length
  if (len < 2 || len > 25) return { ok: false, value, code: 'length', error: 'Ton mot doit faire entre 2 et 25 caractères.' }
  if (!/^[\p{L}][\p{L} '\-]*$/u.test(value) || !/\p{L}$/u.test(value)) {
    return { ok: false, value, code: 'chars', error: 'Seulement des lettres, espaces, traits d’union et apostrophes.' }
  }
  if (value.split(' ').filter(Boolean).length > 3) return { ok: false, value, code: 'words', error: 'Trois mots au plus.' }
  if (compactWord(value).length < 2) return { ok: false, value, code: 'short', error: 'Ton mot est trop court.' }
  return { ok: true, value }
}

/**
 * Motif de l'indice : une case par lettre ; espaces, traits d'union et apostrophes visibles.
 * Retourne un tableau d'éléments { t: 'l' | 's' | 'd' | 'a', i } (i = index dans le mot).
 */
export function hintPattern(word) {
  const chars = Array.from(String(word))
  return chars.map((ch, i) => {
    if (ch === ' ') return { t: 's', i }
    if (ch === '-') return { t: 'd', i }
    if (ch === "'" || ch === '’') return { t: 'a', i }
    return { t: 'l', i }
  })
}
