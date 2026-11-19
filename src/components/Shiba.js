// Mascotte originale : shiba en formes simples et aplats (vectoriel).
// 4 pelages × expressions × accessoires gagnés. Sert d'avatar, d'illustration et d'indicateur de chargement.
import { html } from '../lib/html.js'

export const COAT_COLORS = {
  roux: { fur: '#EE9D5C', dark: '#D7823F', mask: '#FFF3E6', earIn: '#F8CBA5', brow: '#FFF3E6' },
  creme: { fur: '#F2D8B0', dark: '#DFBE8D', mask: '#FFF9F0', earIn: '#FAE5CA', brow: '#FFF9F0' },
  sesame: { fur: '#D49A64', dark: '#7E5536', mask: '#FCEBD9', earIn: '#EDC09A', brow: '#FCEBD9' },
  noir: { fur: '#4E3F3A', dark: '#33282A', mask: '#FAEBDD', earIn: '#8C6E60', brow: '#E7A867' },
}

const INK = '#3B2E2B'
const TONGUE = '#F28C9A'
const BLUSH = '#F6A6A6'

function Eyes({ mood, c }) {
  const arc = (x) => html`<path d=${`M${x - 6} 65 Q${x} 58.5 ${x + 6} 65`} fill="none" stroke=${INK} stroke-width="3.6" stroke-linecap="round" />`
  const dot = (x, r = 4.6) => html`<g><circle cx=${x} cy="64" r=${r} fill=${INK} /><circle cx=${x + 1.6} cy="62.2" r=${r * 0.36} fill="#fff" /></g>`
  const ring = c === COAT_COLORS.noir ? html`<circle cx="45" cy="64" r="8.5" fill=${c.brow} /><circle cx="75" cy="64" r="8.5" fill=${c.brow} />` : null
  switch (mood) {
    case 'concentre':
      return html`<g>${ring}${dot(45, 4)}${dot(75, 4)}
        <path d="M38 57 L52 60" stroke=${INK} stroke-width="3" stroke-linecap="round" />
        <path d="M82 57 L68 60" stroke=${INK} stroke-width="3" stroke-linecap="round" /></g>`
    case 'surpris':
      return html`<g>${ring}${dot(45, 5.8)}${dot(75, 5.8)}</g>`
    case 'triste':
      return html`<g>${ring}${dot(45, 4.2)}${dot(75, 4.2)}
        <path d="M37 58 L50 55" stroke=${INK} stroke-width="3" stroke-linecap="round" />
        <path d="M83 58 L70 55" stroke=${INK} stroke-width="3" stroke-linecap="round" />
        <path d="M79 70 C77 74 77 77 80 78 C83 77 83 74 81 70 L80 68 Z" fill="#8CC8F2" /></g>`
    case 'love':
      return html`<g>${[45, 75].map((x) => html`<path d=${`M${x} 70 C${x - 9} 63 ${x - 6} 56 ${x} 60 C${x + 6} 56 ${x + 9} 63 ${x} 70 Z`} fill="#E8506B" />`)}</g>`
    case 'laugh':
      return html`<g>
        <path d="M39 61 L49 65 L39 68" fill="none" stroke=${INK} stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M81 61 L71 65 L81 68" fill="none" stroke=${INK} stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M86 70 C84 74 84 77 87 78 C90 77 90 74 88 70 L87 68 Z" fill="#8CC8F2" /></g>`
    case 'wink':
      return html`<g>${ring}${dot(45)}${arc(75)}</g>`
    case 'fete':
    case 'content':
    default:
      return html`<g>${ring}${arc(45)}${arc(75)}</g>`
  }
}

function Mouth({ mood }) {
  switch (mood) {
    case 'surpris':
      return html`<g><ellipse cx="60" cy="88" rx="4.6" ry="5.4" fill=${INK} /><ellipse cx="60" cy="90" rx="2.6" ry="2" fill=${TONGUE} /></g>`
    case 'triste':
      return html`<path d="M53 89 Q60 83.5 67 89" fill="none" stroke=${INK} stroke-width="3" stroke-linecap="round" />`
    case 'concentre':
      return html`<g><path d="M53 85 Q60 87.5 67 85" fill="none" stroke=${INK} stroke-width="3" stroke-linecap="round" />
        <path d="M62 86 Q63 93 67 93 Q71 92 69 86 Z" fill=${TONGUE} /></g>`
    case 'fete':
    case 'love':
    case 'laugh':
      return html`<g><path d="M50 83 Q60 99 70 83 Z" fill=${INK} stroke=${INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M54.5 88.5 Q60 95.5 65.5 88.5 Q60 91 54.5 88.5 Z" fill=${TONGUE} /></g>`
    case 'wink':
      return html`<g><path d="M52 84 Q56 89 60 84 Q64 89 68 84" fill="none" stroke=${INK} stroke-width="3" stroke-linecap="round" />
        <path d="M61 86 Q61 94 65.5 94 Q70 93.5 68.5 86 Z" fill=${TONGUE} /></g>`
    default:
      return html`<path d="M52 84 Q56 89 60 84 Q64 89 68 84" fill="none" stroke=${INK} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
  }
}

function Accessories({ acc }) {
  const set = new Set(acc || [])
  return html`<g>
    ${set.has('bandana') &&
    html`<g><path d="M27 95 Q60 110 93 95 L84 104 Q60 124 36 104 Z" fill="#F47E7E" />
      <circle cx="50" cy="106" r="2" fill="#fff" /><circle cx="60" cy="112" r="2" fill="#fff" /><circle cx="70" cy="106" r="2" fill="#fff" /></g>`}
    ${set.has('echarpe') &&
    html`<g><path d="M24 95 Q60 112 96 95 L97 105 Q60 123 23 105 Z" fill="#8FD3B4" />
      <path d="M40 101 L44 113 M60 105 L60 117 M80 101 L76 113" stroke="#B9A6EC" stroke-width="4" stroke-linecap="round" />
      <path d="M80 106 L93 104 L95 119 L82 120 Z" fill="#8FD3B4" /><path d="M83 112 L94 111" stroke="#B9A6EC" stroke-width="3" /></g>`}
    ${set.has('lunettes') &&
    html`<g fill="rgba(255,255,255,0.18)" stroke=${INK} stroke-width="3">
      <circle cx="45" cy="64" r="10.5" /><circle cx="75" cy="64" r="10.5" /><path d="M55.5 63 Q60 60 64.5 63" fill="none" /></g>`}
    ${set.has('beret') &&
    html`<g><ellipse cx="58" cy="27" rx="31" ry="10.5" transform="rotate(-9 58 27)" fill="#5E62C9" />
      <rect x="57" y="11" width="5" height="8" rx="2.5" fill="#5E62C9" /></g>`}
    ${set.has('couronne') &&
    html`<g><path d="M37 32 L40 11 L50 22 L60 6 L70 22 L80 11 L83 32 Z" fill="#F6C445" stroke="#E2A92E" stroke-width="2" stroke-linejoin="round" />
      <circle cx="60" cy="24" r="3.4" fill="#F0569B" /><circle cx="46" cy="27" r="2.6" fill="#3FB6F0" /><circle cx="74" cy="27" r="2.6" fill="#3FB6F0" /></g>`}
  </g>`
}

function Head({ coat, mood, acc }) {
  const c = COAT_COLORS[coat] || COAT_COLORS.roux
  const party = mood === 'fete'
  return html`<g>
    <path d="M19 54 C16 36 21 19 30 10 C34 7 38 8 41 11 L58 32 Z" fill=${c.fur} />
    <path d="M27 45 C26 33 28 23 33 17 L48 33 Z" fill=${c.earIn} />
    <path d="M101 54 C104 36 99 19 90 10 C86 7 82 8 79 11 L62 32 Z" fill=${c.fur} />
    <path d="M93 45 C94 33 92 23 87 17 L72 33 Z" fill=${c.earIn} />
    <path d="M60 24 C86 24 104 42 105 64 C106 88 86 106 60 106 C34 106 14 88 15 64 C16 42 34 24 60 24 Z" fill=${c.fur} />
    ${coat === 'sesame' && html`<path d="M60 24 C80 24 96 33 103 50 C92 41 77 37 60 37 C43 37 28 41 17 50 C24 33 40 24 60 24 Z" fill=${c.dark} opacity="0.5" />`}
    <path d="M60 57 C68 57 72 62 78 66 C90 66 100 74 99 85 C97 99 80 106 60 106 C40 106 23 99 21 85 C20 74 30 66 42 66 C48 62 52 57 60 57 Z" fill=${c.mask} />
    <ellipse cx="44" cy="50" rx="6" ry="4" fill=${c.brow} />
    <ellipse cx="76" cy="50" rx="6" ry="4" fill=${c.brow} />
    <ellipse cx="32" cy="82" rx="7" ry="4.6" fill=${BLUSH} opacity="0.6" />
    <ellipse cx="88" cy="82" rx="7" ry="4.6" fill=${BLUSH} opacity="0.6" />
    <${Eyes} mood=${mood} c=${c} />
    <path d="M53.5 74 C53.5 71 56 70 60 70 C64 70 66.5 71 66.5 74 C66.5 77 63 79.6 60 79.6 C57 79.6 53.5 77 53.5 74 Z" fill=${INK} />
    <ellipse cx="57.5" cy="72.6" rx="2" ry="1.2" fill="#fff" opacity="0.6" />
    <${Mouth} mood=${mood} />
    <${Accessories} acc=${acc} />
    ${party &&
    html`<g><path d="M10 26 l3 -7 l3 7 l-3 7z" fill="#FFD85A" /><circle cx="108" cy="22" r="3.5" fill="#F0569B" />
      <circle cx="104" cy="38" r="2.4" fill="#3FB6F0" /><path d="M14 44 l2 -4 l2 4 l-2 4z" fill="#8FD3B4" /></g>`}
  </g>`
}

/**
 * @param {object} p
 * @param {'roux'|'creme'|'sesame'|'noir'} p.coat
 * @param {'content'|'concentre'|'surpris'|'triste'|'fete'|'love'|'laugh'|'wink'} p.mood
 * @param {string[]} p.acc     accessoires portés
 * @param {number} p.size      taille en px
 * @param {boolean} p.body     shiba entier (assis) plutôt que la tête seule
 * @param {boolean} p.wag      la queue remue (indicateur de chargement)
 */
export function Shiba({ coat = 'roux', mood = 'content', acc = [], size = 40, body = false, wag = false, label, class: cls = '' }) {
  const c = COAT_COLORS[coat] || COAT_COLORS.roux
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }
  if (!body) {
    return html`<svg class=${`shiba ${cls}`} width=${size} height=${size} viewBox="0 0 120 120" ...${a11y}><${Head} coat=${coat} mood=${mood} acc=${acc} /></svg>`
  }
  return html`<svg class=${`shiba ${wag ? 'shiba-wag' : ''} ${cls}`} width=${size} height=${(size * 172) / 160} viewBox="0 0 160 172" ...${a11y}>
    <g class="tail">
      <path d="M112 136 C138 136 152 108 140 90 C130 76 108 82 112 98 C114 108 128 106 128 98" fill="none" stroke=${c.fur} stroke-width="15" stroke-linecap="round" />
      <path d="M134 94 C134 86 124 84 120 90" fill="none" stroke=${c.mask} stroke-width="6" stroke-linecap="round" />
    </g>
    <ellipse cx="80" cy="128" rx="42" ry="36" fill=${c.fur} />
    <ellipse cx="80" cy="138" rx="25" ry="26" fill=${c.mask} />
    <ellipse cx="62" cy="162" rx="12" ry="8.5" fill=${c.mask} />
    <ellipse cx="98" cy="162" rx="12" ry="8.5" fill=${c.mask} />
    <path d="M58 162 v-4 M62 162 v-5 M66 162 v-4 M94 162 v-4 M98 162 v-5 M102 162 v-4" stroke=${c.dark} stroke-width="1.6" stroke-linecap="round" opacity="0.5" />
    <g transform="translate(20 2)"><${Head} coat=${coat} mood=${mood} acc=${acc} /></g>
  </svg>`
}

/** Avatar d'un membre (profil public). */
export function Avatar({ user, size = 40, mood = 'content' }) {
  return html`<${Shiba} coat=${user?.coat || 'creme'} acc=${user?.acc || []} mood=${mood} size=${size} />`
}

const REACTION_MOODS = { coeur: 'love', rire: 'laugh', wouah: 'surpris', snif: 'triste', bravo: 'fete', ouaf: 'wink' }
const REACTION_COATS = { coeur: 'roux', rire: 'creme', wouah: 'sesame', snif: 'creme', bravo: 'roux', ouaf: 'noir' }

/** Réaction illustrée par le shiba. */
export function ReactionIcon({ id, size = 26 }) {
  return html`<${Shiba} coat=${REACTION_COATS[id] || 'roux'} mood=${REACTION_MOODS[id] || 'content'} size=${size} />`
}

/** Shiba dont la queue remue : indicateur de chargement. */
export function ShibaLoader({ text = 'Chargement…', size = 96, coat = 'roux' }) {
  return html`<div class="loader" role="status" aria-live="polite">
    <${Shiba} body wag coat=${coat} size=${size} />
    <span>${text}</span>
  </div>`
}
