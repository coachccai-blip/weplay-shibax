// Formats de dates et petits utilitaires d'affichage, dans la langue choisie.
import { serverNow } from './clock.js'
import { t, locale } from '../i18n/index.js'

const cache = new Map()
function fmt(kind, options) {
  const key = `${locale()}|${kind}`
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale(), options))
  return cache.get(key)
}

function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Heure pour un message : « 14:32 ». */
export function hhmm(ts) {
  return fmt('time', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

/** Horodatage court pour la liste des groupes : « 14:32 », « hier », « lun. », « 12 nov. ». */
export function shortWhen(ts) {
  if (!ts) return ''
  const today = startOfDay(serverNow())
  if (ts >= today) return hhmm(ts)
  if (ts >= today - 86400000) return t('date.yesterday')
  if (ts >= today - 6 * 86400000) return fmt('wd', { weekday: 'short' }).format(new Date(ts))
  return fmt('dm', { day: 'numeric', month: 'short' }).format(new Date(ts))
}

/** Séparateur de jour dans le fil : « Aujourd'hui », « Hier », « mardi 18 novembre ». */
export function dayLabel(ts) {
  const today = startOfDay(serverNow())
  if (ts >= today) return t('date.today')
  if (ts >= today - 86400000) return t('date.yesterdayCap')
  const s = fmt('long', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortDate(ts) {
  return fmt('date', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts))
}

/** « il y a 3 min », « il y a 2 h », « hier »… */
export function ago(ts) {
  const s = Math.max(0, Math.round((serverNow() - ts) / 1000))
  if (s < 60) return t('date.justNow')
  if (s < 3600) return t('date.minutesAgo', { n: Math.floor(s / 60) })
  if (s < 86400) return t('date.hoursAgo', { n: Math.floor(s / 3600) })
  return shortWhen(ts)
}

export function sameDay(a, b) {
  return startOfDay(a) === startOfDay(b)
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function minutesLabel(sec) {
  return t('common.minutes', { n: Math.max(1, Math.round(sec / 60)) })
}

export function formatNumber(n) {
  return new Intl.NumberFormat(locale()).format(n)
}

/** Vrai si le message ne contient que 1 à 3 emojis (affichés en grand). */
export function isEmojiOnly(text) {
  const s = String(text || '').trim()
  if (!s || s.length > 24) return false
  return /^(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\p{Emoji_Component}|\p{Extended_Pictographic})*\s*){1,3}$/u.test(s)
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
