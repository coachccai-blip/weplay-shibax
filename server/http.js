// Réponses JSON, erreurs et lecture des requêtes.

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export function fail(status, code, message, extra) {
  throw new HttpError(status, code, message, extra)
}

export function ensure(condition, status, code, message, extra) {
  if (!condition) throw new HttpError(status, code, message, extra)
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  })
}

// `netlify dev` et `netlify serve` rejouent les réponses 403/404 avec des variantes « .html » (imitation
// du CDN pour les fichiers statiques) : en local seulement, on les signale avec 409/410. Le code JSON
// reste identique. Un serveur local se reconnaît à NETLIFY_DEV ou à son adresse (jamais en production).
const DEV_STATUS = { 403: 409, 404: 410 }
let localServer = process.env.NETLIFY_DEV === 'true'

export function noteRequestHost(hostname) {
  if (!localServer && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) localServer = true
}

const localStatus = (status) => (localServer ? DEV_STATUS[status] || status : status)

/** Statut d'une réponse brute (image) : même correspondance locale que pour les erreurs JSON. */
export function plainStatus(status) {
  return localStatus(status)
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    const status = localStatus(err.status)
    return json({ error: { code: err.code, message: err.message, ...err.extra } }, { status })
  }
  console.error('[api] erreur inattendue', err)
  return json(
    { error: { code: 'internal', message: 'Oups, le shiba s’est pris les pattes dans le tapis. Réessaie !' } },
    { status: 500 },
  )
}

/** Lit un corps JSON (64 Ko par défaut). */
export async function readJson(req, maxBytes = 64 * 1024) {
  if (req.method === 'GET' || req.method === 'HEAD') return {}
  const text = await req.text()
  if (text.length > maxBytes) fail(413, 'too_large', 'Requête trop volumineuse.')
  if (!text) return {}
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    fail(400, 'bad_json', 'Requête invalide.')
  }
}

export const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
export const int = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def)
export const bool = (v) => v === true || v === 'true' || v === 1
