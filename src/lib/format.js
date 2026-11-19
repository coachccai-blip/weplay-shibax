// Formats de dates et petits utilitaires d'affichage (français).
import { serverNow } from './clock.js'

const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Heure pour un message : « 14:32 ». */
export function hhmm(ts) {
  return time.format(new Date(ts))
}

/** Horodatage court pour la liste des salons : « 14:32 », « hier », « lun. », « 12 nov. ». */
export function shortWhen(ts) {
  if (!ts) return ''
  const now = serverNow()
  const today = startOfDay(now)
  if (ts >= today) return hhmm(ts)
  if (ts >= today - 86400000) return 'hier'
  if (ts >= today - 6 * 86400000) return weekday.format(new Date(ts))
  return shortDate.format(new Date(ts))
}

/** Séparateur de jour dans le fil : « Aujourd'hui », « Hier », « mardi 18 novembre ». */
export function dayLabel(ts) {
  const now = serverNow()
  const today = startOfDay(now)
  if (ts >= today) return 'Aujourd’hui'
  if (ts >= today - 86400000) return 'Hier'
  const s = longDay.format(new Date(ts))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function sameDay(a, b) {
  return startOfDay(a) === startOfDay(b)
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function minutesLabel(sec) {
  const m = Math.max(1, Math.round(sec / 60))
  return `${m} min`
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`
}

/** Vrai si le message ne contient que 1 à 3 emojis (affichés en grand). */
export function isEmojiOnly(text) {
  const s = String(text || '').trim()
  if (!s || s.length > 24) return false
  return /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u.test(s)
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/)
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
}

const ROOM_COLORS = ['var(--apricot)', 'var(--lavender)', 'var(--mint)', 'var(--sky)', 'var(--butter)', 'var(--coral)']
export function roomColor(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ROOM_COLORS[h % ROOM_COLORS.length]
}
