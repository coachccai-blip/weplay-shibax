// État global : session, profil, notifications, fenêtres, célébrations.
import { signal } from '@preact/signals'
import { api, setToken, on, ApiError } from '../lib/transport.js'
import { load, save } from '../lib/storage.js'
import { settings, play, confetti } from '../lib/fx.js'
import { newDeviceId } from '../../shared/ids.js'

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

export function errorToast(err, fallback = 'Oups, ça n’a pas marché. Réessaie !') {
  toast(err instanceof ApiError ? err.message : fallback, 'error', 4200)
}

export function openModal(type, props = {}) {
  modal.value = { type, props }
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
  const res = await api.post('account', { deviceId: deviceId() }, { auth: false, retries: 2 })
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
      boot.value = { status: 'revoked', message: err.message }
      return
    }
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      // Site publié sans ses Functions (dépôt fait sans être connecté à Netlify, par exemple).
      boot.value = {
        status: 'error',
        message: 'Le serveur de l’application (Netlify Functions) ne répond pas. Connecte-toi à Netlify et redépose le projet pour qu’il soit construit.',
      }
      return
    }
    boot.value = { status: 'error', message: err.message || 'Impossible de joindre le serveur. Vérifie ta connexion.' }
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

export async function regenerateKey() {
  const res = await api.post('me/key')
  setSession({ ...session.value, token: res.token, key: res.key })
  return res.key
}

export function logout() {
  setSession(null)
  me.value = null
  boot.value = { status: 'revoked', message: 'Tu es déconnecté de cet appareil.' }
}

on('unauthorized', (err) => {
  if (boot.value.status === 'ready') boot.value = { status: 'revoked', message: err.message }
})
