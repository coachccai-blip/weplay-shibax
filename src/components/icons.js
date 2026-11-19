// Icônes au trait (24×24), arrondies comme le reste de l'interface.
import { html } from '../lib/html.js'

const P = {
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M4 12l16-8-6 16-2.5-6.5L4 12z',
  plus: 'M12 5v14M5 12h14',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.3 3.3 0 0 1 0 6.4M18.5 14.6c1.7.8 2.8 2.6 3 5.4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  dice: 'M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01',
  edit: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4zM13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3l9-16zM12 10v4M12 17h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  eraser: 'M14.5 4.5l5 5-9 9h-5l-2-2a2 2 0 0 1 0-2.8l11-9.2zM9 9.5l5 5M10 20h10',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  skip: 'M6 5l8 7-8 7V5zM17 5v14',
  play: 'M7 5.5l11 6.5-11 6.5V5.5z',
  gamepad: 'M7 9h3M8.5 7.5v3M15 9h.01M17.5 11h.01M6.5 5h11A3.5 3.5 0 0 1 21 8.5l-.8 7a2.7 2.7 0 0 1-4.8 1.3L14 15h-4l-1.4 1.8a2.7 2.7 0 0 1-4.8-1.3l-.8-7A3.5 3.5 0 0 1 6.5 5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.5A16.7 16.7 0 0 0 2.5 12S6 18 12 18c1.5 0 2.9-.4 4-1M10 10.2a3 3 0 0 0 4 4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2zM7 7h.01M17 7h.01M7 17h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  soundOn: 'M4 9h4l5-4v14l-5-4H4V9zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  soundOff: 'M4 9h4l5-4v14l-5-4H4V9zM17 9.5l5 5M22 9.5l-5 5',
  chat: 'M4 5h16v11H9l-5 4V5zM8 10h8M8 13h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  chevron: 'M9 6l6 6-6 6',
  crown: 'M4 18h16M4 18L3 7l5 4 4-6 4 6 5-4-1 11',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4L11.5 6M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.4',
  door: 'M6 21V4h9l3 1v16M14 12h.01M3 21h18',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  flame: 'M12 21c4 0 7-2.8 7-6.8 0-4.4-3.7-6.6-4.7-10.2-2.4 1.6-3.3 4-3 6.2-1.4-.6-2.3-1.8-2.6-3.2C6.6 9 5 11.4 5 14.2 5 18.2 8 21 12 21z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
}

export function Icon({ name, size = 24, label, class: cls = '' }) {
  const d = P[name]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true', focusable: 'false' }
  return html`<svg class=${`icon ${cls}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ...${a11y}><path d=${d} /></svg>`
}

// Icônes des badges (sur pastille jaune beurre).
const B = {
  paw: html`<g fill="#4A3B36"><ellipse cx="24" cy="30" rx="8" ry="6.5" /><circle cx="15" cy="21" r="3.6" /><circle cx="21" cy="16" r="3.6" /><circle cx="27" cy="16" r="3.6" /><circle cx="33" cy="21" r="3.6" /></g>`,
  nose: html`<g><path d="M15 22c0-4 4-6 9-6s9 2 9 6-4 9-9 9-9-5-9-9z" fill="#4A3B36" /><ellipse cx="20.5" cy="20" rx="2.6" ry="1.6" fill="#fff" opacity=".7" /><path d="M10 14l3 2M38 14l-3 2M9 22h4M35 22h4" stroke="#4A3B36" stroke-width="2.4" stroke-linecap="round" /></g>`,
  brush: html`<g><path d="M30 10l8 8-13 13-8-8z" fill="#D9CCF5" stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round" /><path d="M17 23c-4 0-7 3-7 7 0 3-1 5-3 6 6 1 13-1 14-6l-4-7z" fill="#F0569B" stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round" /></g>`,
  target: html`<g fill="none" stroke="#4A3B36" stroke-width="2.6"><circle cx="24" cy="24" r="13" fill="#fff" /><circle cx="24" cy="24" r="8" fill="#F9B9B7" /><circle cx="24" cy="24" r="3" fill="#4A3B36" /><path d="M24 24L36 12M32 12h4v4" stroke-linecap="round" /></g>`,
  house: html`<g stroke="#4A3B36" stroke-width="2.6" stroke-linejoin="round"><path d="M11 23L24 12l13 11v13H11z" fill="#FFC9A3" /><path d="M20 36v-8h8v8" fill="#fff" /></g>`,
  crown: html`<path d="M10 33l-2-17 9 7 7-11 7 11 9-7-2 17z" fill="#F6C445" stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round" />`,
  calendar: html`<g stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round"><rect x="10" y="13" width="28" height="24" rx="5" fill="#fff" /><path d="M10 20h28M17 9v7M31 9v7" stroke-linecap="round" /><path d="M17 28l4 4 9-9" fill="none" stroke-linecap="round" /></g>`,
  medal: html`<g stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round"><path d="M16 8l5 12M32 8l-5 12" stroke-linecap="round" /><circle cx="24" cy="29" r="9.5" fill="#F6C445" /><path d="M24 24.5l1.6 3.2 3.4.5-2.5 2.4.6 3.4-3.1-1.6-3.1 1.6.6-3.4-2.5-2.4 3.4-.5z" fill="#fff" stroke-width="1.6" /></g>`,
  bubble: html`<g stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round"><path d="M9 13h30v18H21l-8 6v-6H9z" fill="#BFDFF7" /><path d="M16 22h.01M24 22h.01M32 22h.01" stroke-width="3.6" stroke-linecap="round" /></g>`,
  star: html`<path d="M24 8l4.6 9.5 10.4 1.5-7.5 7.3 1.8 10.3L24 31.7l-9.3 4.9 1.8-10.3L9 19l10.4-1.5z" fill="#F6C445" stroke="#4A3B36" stroke-width="2.4" stroke-linejoin="round" />`,
}

export function BadgeIcon({ icon, size = 52 }) {
  return html`<svg class="badge-icon" width=${size} height=${size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="23" fill="#FFE9A8" />${B[icon] || B.star}</svg>`
}
