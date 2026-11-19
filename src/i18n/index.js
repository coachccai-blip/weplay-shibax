// Traductions : français et anglais. La langue est enregistrée sur le compte (donc partagée par
// le téléphone et le PC) et retenue sur l'appareil avant la création du compte.
import { signal, effect } from '@preact/signals'
import { load, save } from '../lib/storage.js'
import fr from './fr.js'
import en from './en.js'

export const LANGS = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
]
const DICTS = { fr, en }

function detect() {
  const saved = load('shx.lang')
  if (saved === 'fr' || saved === 'en') return saved
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'fr'
  return /^fr\b/i.test(nav) ? 'fr' : /^en\b/i.test(nav) ? 'en' : 'fr'
}

export const lang = signal(detect())

effect(() => {
  document.documentElement.lang = lang.value
})

export function setLang(next) {
  if (!DICTS[next]) return
  lang.value = next
  save('shx.lang', next)
}

/** Texte traduit ; `{nom}` est remplacé par params.nom. */
export function t(key, params) {
  const dict = DICTS[lang.value] || fr
  let s = dict[key]
  if (s === undefined) s = fr[key]
  if (s === undefined) return key
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined || params[k] === null ? '' : String(params[k])))
  return s
}

const rules = {}
/** Pluriel : clé + « .one » ou « .other » selon la langue (0 est au singulier en français). */
export function tn(key, n, params = {}) {
  rules[lang.value] ||= new Intl.PluralRules(lang.value)
  const form = rules[lang.value].select(n) === 'one' ? 'one' : 'other'
  return t(`${key}.${form}`, { n, ...params })
}

/** Locale Intl de la langue courante. */
export function locale() {
  return lang.value === 'en' ? 'en-GB' : 'fr-FR'
}

/** Message d'erreur de l'API traduit d'après son code (repli : le message du serveur). */
export function errorText(err, fallbackKey = 'err.generic') {
  if (!err) return t(fallbackKey)
  const key = `err.${err.code}`
  const dict = DICTS[lang.value] || fr
  if (dict[key] || fr[key]) return t(key, { ...err, s: Math.ceil((err.retryAfterMs || 0) / 1000) })
  return err.message || t(fallbackKey)
}

export function hasKey(key) {
  return key in fr && key in en
}

export { fr, en }
