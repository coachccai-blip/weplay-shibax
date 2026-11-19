// Sessions signées (HMAC) et clés de connexion hachées (scrypt).
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { K } from './keys.js'
import { HttpError } from './http.js'
import { TtlCache } from './db.js'
import { USER_ID_RE, DEVICE_ID_RE } from '../shared/ids.js'

const scrypt = promisify(scryptCb)
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

let secretValue = null

/** Secret de signature : variable SHX_SECRET, sinon généré une fois et conservé dans Blobs. */
export async function getSecret(db) {
  if (secretValue) return secretValue
  if (process.env.SHX_SECRET) return (secretValue = process.env.SHX_SECRET)
  let doc = await db.get(K.secret())
  if (!doc) {
    await db.create(K.secret(), { value: randomBytes(32).toString('hex'), createdAt: Date.now() })
    doc = await db.get(K.secret())
  }
  secretValue = doc.value
  return secretValue
}

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export async function signSession(db, { uid, gen, dev }) {
  const payload = b64u(JSON.stringify({ u: uid, g: gen, d: dev, t: Date.now() }))
  const sig = b64u(createHmac('sha256', await getSecret(db)).update(payload).digest())
  return `${payload}.${sig}`
}

async function verifySession(db, token) {
  if (typeof token !== 'string' || token.length > 512) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', await getSecret(db)).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!USER_ID_RE.test(data.u) || !DEVICE_ID_RE.test(data.d)) return null
    return data
  } catch {
    return null
  }
}

// ---------- Photos de profil : adresses signées, valables une à deux semaines ----------

const WEEK = 7 * 86400000

/** Adresse de la photo d'un membre (donnée seulement aux membres de ses groupes). */
export async function photoUrl(db, uid, v, now = Date.now()) {
  if (!v) return null
  const exp = Math.floor(now / WEEK) * WEEK + 2 * WEEK
  const sig = createHmac('sha256', await getSecret(db)).update(`ph:${uid}:${v}:${exp}`).digest('base64url').slice(0, 22)
  return `/api/photos/${uid}/${v}?e=${exp}&s=${sig}`
}

export async function checkPhotoSignature(db, uid, v, exp, sig) {
  const e = Number(exp)
  if (!Number.isFinite(e) || e < Date.now() || typeof sig !== 'string' || sig.length !== 22) return false
  const expected = createHmac('sha256', await getSecret(db)).update(`ph:${uid}:${v}:${e}`).digest('base64url').slice(0, 22)
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

export async function hashKey(key) {
  const salt = randomBytes(16)
  const hash = await scrypt(key, salt, 32, SCRYPT)
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function checkKey(key, stored) {
  const [v, saltB64, hashB64] = String(stored || '').split('$')
  if (v !== 's1' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const got = await scrypt(String(key), Buffer.from(saltB64, 'base64'), expected.length, SCRYPT)
  return timingSafeEqual(got, expected)
}

// Le compte est relu au plus toutes les 5 s par instance : régénérer la clé
// invalide les autres appareils (génération différente) en quelques secondes.
const acctCache = new TtlCache(5000)

export function forgetAccount(uid) {
  acctCache.delete(uid)
}

export async function loadAccount(db, uid, { fresh = false } = {}) {
  if (!fresh) {
    const cached = acctCache.get(uid)
    if (cached) return cached
  }
  const acct = await db.get(K.acct(uid))
  if (acct) acctCache.set(uid, acct)
  return acct
}

/** Vérifie le jeton de session porté par la requête. */
export async function authenticate(db, req, { required = true } = {}) {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    if (!required) return null
    throw new HttpError(401, 'auth_required', 'Connecte-toi pour continuer.')
  }
  const session = await verifySession(db, token)
  if (!session) throw new HttpError(401, 'auth_invalid', 'Ta session n’est plus valide.')
  const acct = await loadAccount(db, session.u)
  if (!acct) throw new HttpError(401, 'auth_invalid', 'Ce compte n’existe plus.')
  if (acct.gen !== session.g) {
    throw new HttpError(401, 'auth_revoked', 'Ta clé de connexion a été régénérée sur un autre appareil.')
  }
  return { uid: session.u, dev: session.d, acct }
}
