// Module de transport unique : tout envoi et toute réception passent par ici.
// Aujourd'hui des requêtes HTTP vers les Functions ; demain, pourquoi pas des WebSockets,
// sans toucher aux règles du jeu (le reste de l'application n'appelle que `api` et `poll`).
import { signal } from '@preact/signals'
import { syncClock } from './clock.js'

export const online = signal(true)
const listeners = new Map()
let token = null

export function setToken(t) {
  token = t || null
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(fn)
  return () => listeners.get(event).delete(fn)
}

function emit(event, payload) {
  for (const fn of listeners.get(event) || []) fn(payload)
}

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    Object.assign(this, extra)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Requête JSON vers l'API.
 * @param {string} method
 * @param {string} path      ex. « rooms/abc/messages »
 * @param {object} [body]
 * @param {object} [opts]    { retries, timeout, auth }
 */
export async function request(method, path, body, { retries = 0, timeout = 15000, auth = true } = {}) {
  let attempt = 0
  for (;;) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    const sentAt = Date.now()
    try {
      const res = await fetch(`/api/${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      })
      clearTimeout(timer)
      const receivedAt = Date.now()
      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }
      if (!online.value) online.value = true
      if (data && typeof data.now === 'number') syncClock(data.now, sentAt, receivedAt)
      if (!res.ok) {
        const err = data?.error || {}
        const apiErr = new ApiError(res.status, err.code || `http_${res.status}`, err.message || 'Une erreur est survenue.', err)
        if (res.status === 401 && auth) emit('unauthorized', apiErr)
        if ((res.status >= 500 || res.status === 503) && attempt < retries) {
          attempt++
          await sleep(400 * 2 ** attempt)
          continue
        }
        throw apiErr
      }
      return data
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof ApiError) throw err
      // Erreur réseau ou délai dépassé : nouvel essai éventuel.
      if (attempt < retries) {
        attempt++
        await sleep(400 * 2 ** attempt)
        continue
      }
      online.value = false
      throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ton réseau.')
    }
  }
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body = {}, opts) => request('POST', path, body, opts),
  patch: (path, body = {}, opts) => request('PATCH', path, body, opts),
}

/**
 * Boucle d'interrogation adaptative : un seul appel « sync » à la fois,
 * mise en pause quand l'onglet est masqué, rattrapage en une requête au retour.
 * @param {() => {body: object|null, interval: number}} plan   ce qu'il faut demander, et à quel rythme
 * @param {(result: object, body: object) => void} onResult
 */
export function poll(plan, onResult) {
  let timer = null
  let running = false
  let stopped = false
  let failures = 0

  async function tick() {
    timer = null
    if (stopped || running) return
    if (typeof document !== 'undefined' && document.hidden) return
    // `plan` est appelé une seule fois par tour (il compte les tours : battement de cœur, présence…).
    const { body, interval } = plan()
    if (!body) return schedule(interval)
    running = true
    const startedAt = Date.now()
    try {
      const result = await request('POST', 'sync', body, { timeout: 12000 })
      failures = 0
      onResult(result, body)
    } catch (err) {
      failures++
      emit('poll-error', err)
    } finally {
      running = false
      // Rythme régulier : le tour suivant part `interval` ms après le début du précédent.
      const wait = Math.max(50, interval - (Date.now() - startedAt))
      schedule(failures ? Math.min(15000, interval * 2 ** Math.min(failures, 3)) : wait)
    }
  }

  function schedule(ms) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(tick, ms)
  }

  const onVisible = () => {
    if (!document.hidden) schedule(0)
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onVisible)
  schedule(0)

  return {
    now: () => schedule(0),
    stop() {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    },
  }
}
