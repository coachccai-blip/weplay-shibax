// État global : session, profil, notifications, fenêtres, célébrations.
import { signal } from '@preact/signals'
import { api, setToken, on, ApiError } from '../lib/transport.js'
import { load, save } from '../lib/storage.js'
import { settings, play, confetti } from '../lib/fx.js'
import { newDeviceId } from '../../shared/ids.js'
import { lang, setLang, errorText, t } from '../i18n/index.js'
import { rememberPeople } from './people.js'

export const session = signal(load('shx.session'))
export const me = signal(null)
/** loading | ready | revoked | error */
export const boot = signal({ status: 'loading' })
export const toasts = signal([])
export const modal = signal(null)
export const celebrations = signal([])
/** Rappel « note ta clé » en attente (affiché quand les célébrations sont terminées). */
export const keyReminderPending = signal(false)

if (session.value?.token) setToken(session.value.token)

export function deviceId() {
  let id = load('shx.device')
  if (!id || !/^[a-hjkmnp-z2-9]{8}$/.test(id)) {
    id = session.value?.deviceId || newDeviceId()
    save('shx.device', id)
  }
  return id
}

export function setSession(next) {
  session.value = next
  save('shx.session', next)
  if (next?.deviceId) save('shx.device', next.deviceId)
  setToken(next?.token || null)
}

let toastId = 0
export function toast(text, kind = 'info', ms = 3400) {
  const id = ++toastId
  toasts.value = [...toasts.value.slice(-2), { id, text, kind }]
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, ms)
}

export function errorToast(err) {
  toast(err instanceof ApiError ? errorText(err) : t('err.generic'), 'error', 4200)
}

export function openModal(type, props = {}) {
  // L'adresse à l'ouverture : la fenêtre se referme si l'on change d'écran (bouton retour…).
  modal.value = { type, props, at: typeof location !== 'undefined' ? location.hash : '' }
}
export function closeModal() {
  modal.value = null
}

// ---------- Profil ----------

const celebrated = new Set(load('shx.celebrated', []))

function rememberCelebrated(ids) {
  for (const id of ids) celebrated.add(id)
  save('shx.celebrated', [...celebrated])
}

export function applyMe(next, { celebrate = true } = {}) {
  const prev = me.value
  me.value = next
  if (next?.settings) settings.value = { ...settings.value, ...next.settings }
  if (!next) return
  // La langue suit le compte : changée sur le PC, elle change aussi sur le téléphone.
  if (next.settings?.lang && next.settings.lang !== lang.value) setLang(next.settings.lang)
  rememberPeople([{ id: next.id, pseudo: next.pseudo, coat: next.coat, acc: next.acc, level: next.level, photoUrl: next.photoUrl || null }])
  const badges = Object.keys(next.badges || {})
  if (!prev) {
    // Premier chargement : on ne célèbre pas l'existant.
    rememberCelebrated(badges.map((b) => `${next.id}:${b}`))
    return
  }
  if (!celebrate) return
  const fresh = badges.filter((b) => !celebrated.has(`${next.id}:${b}`))
  if (fresh.length) {
    rememberCelebrated(fresh.map((b) => `${next.id}:${b}`))
    celebrations.value = [...celebrations.value, ...fresh.map((id) => ({ type: 'badge', id }))]
  }
}

export function queueCelebration(item) {
  if (item.type === 'badge') {
    const key = `${me.value?.id}:${item.id}`
    if (celebrated.has(key)) return
    rememberCelebrated([key])
  }
  celebrations.value = [...celebrations.value, item]
}

export function shiftCelebration() {
  celebrations.value = celebrations.value.slice(1)
}

export function celebrateNow(item) {
  if (item.type === 'level') {
    play('level')
    confetti()
  } else if (item.type === 'badge') play('badge')
}

export async function refreshMe() {
  try {
    const { me: next } = await api.get('me')
    applyMe(next)
    return next
  } catch {
    return me.value
  }
}

export async function updateMe(patch) {
  const { me: next } = await api.patch('me', patch)
  applyMe(next, { celebrate: false })
  return next
}

// ---------- Démarrage et comptes ----------

export async function createAccount() {
  const res = await api.post('account', { deviceId: deviceId(), lang: lang.value }, { auth: false, retries: 2 })
  setSession({ token: res.token, deviceId: res.deviceId, uid: res.me.id, key: res.key })
  applyMe(res.me)
  return res.me
}

export async function initApp() {
  boot.value = { status: 'loading' }
  try {
    if (!session.value?.token) await createAccount()
    else {
      const { me: current } = await api.get('me', { retries: 2 })
      applyMe(current)
    }
    boot.value = { status: 'ready' }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      boot.value = { status: 'revoked', message: errorText(err) }
      return
    }
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      // Site publié sans ses Functions (dépôt fait sans être connecté à Netlify, par exemple).
      boot.value = { status: 'error', messageKey: 'boot.noFunctions' }
      return
    }
    boot.value = err?.code === 'network' || !err?.message ? { status: 'error', messageKey: 'boot.network' } : { status: 'error', message: errorText(err) }
  }
}

export async function login(id, key) {
  const res = await api.post('account/login', { id, key, deviceId: deviceId() }, { auth: false })
  setSession({ token: res.token, deviceId: res.deviceId, uid: res.me.id, key: res.key })
  me.value = null
  applyMe(res.me)
  boot.value = { status: 'ready' }
  return res.me
}

export async function redeemLink(token) {
  const res = await api.post('link/redeem', { token, deviceId: deviceId() }, { auth: false })
  setSession({ token: res.token, deviceId: res.deviceId, uid: res.me.id, key: null })
  me.value = null
  applyMe(res.me)
  boot.value = { status: 'ready' }
  return res.me
}

export async function startFresh() {
  setSession(null)
  me.value = null
  await initApp()
}

/** Un autre appareil du compte a modifié le profil ou les réglages : on se met à jour. */
export function applyMeRev(rev) {
  if (me.value && Number.isFinite(rev) && rev !== me.value.rev) refreshMe()
}

export async function changeLang(next) {
  setLang(next)
  if (me.value) await updateMe({ settings: { lang: next } }).catch(() => {})
}

export async function uploadPhoto(dataUrl) {
  const { me: next } = await api.post('me/photo', { image: dataUrl }, { timeout: 30000 })
  applyMe(next, { celebrate: false })
  return next
}

export async function deletePhoto() {
  const { me: next } = await api.post('me/photo/remove')
  applyMe(next, { celebrate: false })
  return next
}

export async function regenerateKey() {
  const res = await api.post('me/key')
  setSession({ ...session.value, token: res.token, key: res.key })
  return res.key
}

export function logout() {
  setSession(null)
  me.value = null
  boot.value = { status: 'revoked', messageKey: 'revoked.loggedOut' }
}

on('unauthorized', (err) => {
  if (boot.value.status === 'ready') boot.value = { status: 'revoked', message: errorText(err) }
})
