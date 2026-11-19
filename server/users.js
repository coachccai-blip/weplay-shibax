// Comptes : création automatique, profil (photo comprise), reprise par clé, QR code,
// appareils connectés (téléphone, PC…) et régénération de la clé.
import { K } from './keys.js'
import { SKIP, TtlCache, pMap } from './db.js'
import { fail, ensure, str, bool, plainStatus } from './http.js'
import { authenticate, checkKey, forgetAccount, hashKey, loadAccount, signSession, photoUrl, checkPhotoSignature } from './auth.js'
import {
  newUserId, newLoginKey, newDeviceId, newToken, normalizeKeyInput, normalizeUserIdInput, randomString, LOWER_ALPHABET,
  USER_ID_RE, KEY_RE, DEVICE_ID_RE,
} from '../shared/ids.js'
import { randomPseudo, randomCoat } from '../shared/names.js'
import { cleanLine } from '../shared/text.js'
import { containsBanned } from '../shared/moderation.js'
import { LIMITS } from '../shared/constants.js'
import { COAT_IDS, levelFromXp, rankFor, sanitizeAccessories, currentStreak } from '../shared/progression.js'
import { parisDay, dayDiff } from '../shared/time.js'

export const LANGS = ['fr', 'en']
export const langOf = (v) => (LANGS.includes(v) ? v : 'fr')

export function validatePseudo(input) {
  const pseudo = cleanLine(input)
  const len = Array.from(pseudo).length
  ensure(len >= LIMITS.pseudoMin && len <= LIMITS.pseudoMax, 400, 'pseudo_length', 'Ton pseudo doit faire entre 3 et 16 caractères.')
  ensure(/\p{L}/u.test(pseudo), 400, 'pseudo_letters', 'Ton pseudo doit contenir au moins une lettre.')
  ensure(!containsBanned(pseudo), 400, 'pseudo_banned', 'Ce pseudo n’est pas autorisé. Choisis-en un autre.')
  return pseudo
}

function newUserDoc(uid, now, lang) {
  return {
    id: uid,
    pseudo: randomPseudo(lang),
    coat: randomCoat(),
    acc: [],
    photo: null,
    xp: 0,
    level: 1,
    badges: {},
    stats: { games: 0, wins: 0, msgs: 0, found: 0, drawn: 0 },
    streak: { count: 0, last: null },
    lastGameDay: null,
    applied: [],
    recent: {},
    createdAt: now,
  }
}

// ---------- Appareils connectés ----------

/** Nom lisible d'un appareil d'après son navigateur : « iPhone · Safari », « PC Windows · Chrome »… */
export function deviceName(ua = '') {
  const s = String(ua)
  const os = /iPhone/.test(s)
    ? 'iPhone'
    : /iPad/.test(s)
      ? 'iPad'
      : /Android/.test(s)
        ? /Mobile/.test(s)
          ? 'Android'
          : 'Tablette Android'
        : /Windows/.test(s)
          ? 'PC Windows'
          : /Mac OS X|Macintosh/.test(s)
            ? 'Mac'
            : /CrOS/.test(s)
              ? 'Chromebook'
              : /Linux/.test(s)
                ? 'Linux'
                : 'Appareil'
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(s)
      ? 'Firefox'
      : /SamsungBrowser/.test(s)
        ? 'Samsung Internet'
        : /OPR\//.test(s)
          ? 'Opera'
          : /Chrome\/|CriOS/.test(s)
            ? 'Chrome'
            : /Safari\//.test(s)
              ? 'Safari'
              : ''
  return browser ? `${os} · ${browser}` : os
}

function touchDevice(a, dev, ua, now) {
  a.devices ||= {}
  const cur = a.devices[dev]
  a.devices[dev] = { n: ua ? deviceName(ua) : cur?.n || 'Appareil', c: cur?.c || now, s: now }
  // On garde les 12 appareils vus le plus récemment, et rien de plus vieux que 6 mois.
  const entries = Object.entries(a.devices).filter(([, d]) => now - d.s < 180 * 86400000)
  entries.sort((x, y) => y[1].s - x[1].s)
  a.devices = Object.fromEntries(entries.slice(0, 12))
}

function devicesView(acct, currentDev) {
  return Object.entries(acct.devices || {})
    .map(([id, d]) => ({ id, name: d.n, since: d.c, lastSeen: d.s, current: id === currentDev }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeen - a.lastSeen)
}

// ---------- Profils ----------

/** Profil public affiché aux autres membres. */
export function publicProfile(user) {
  if (!user) return null
  return { id: user.id, pseudo: user.pseudo, coat: user.coat, acc: user.acc || [], level: user.level || 1, photo: user.photo || null }
}

/** Ajoute l'adresse (signée, temporaire) de la photo, pour les seuls membres qui reçoivent ce profil. */
export async function withPhoto(db, profile) {
  if (!profile) return profile
  return { ...profile, photoUrl: profile.photo ? await photoUrl(db, profile.id, profile.photo) : null }
}

/** Profil complet renvoyé à son propriétaire. */
export async function privateProfile(db, user, acct, dev, now = Date.now()) {
  const lv = levelFromXp(user.xp || 0)
  const today = parisDay(now)
  const streak = currentStreak(user.streak, user.streak?.last ? dayDiff(user.streak.last, today) : 99)
  return {
    ...(await withPhoto(db, publicProfile(user))),
    xp: user.xp || 0,
    levelInfo: lv,
    rank: rankFor(lv.level),
    badges: user.badges || {},
    stats: user.stats || {},
    streak,
    playedToday: user.lastGameDay === today,
    onboarded: !!acct.onboarded,
    settings: { sound: true, motion: 'system', lang: 'fr', ...(acct.settings || {}) },
    keyReminderShown: !!acct.keyReminderShown,
    createdAt: acct.createdAt,
    devices: devicesView(acct, dev),
    rev: acct.rev || 0,
  }
}

const profileCache = new TtlCache(8000, 2000)

/** Profils publics de plusieurs utilisateurs (cache court par instance), avec l'adresse de leur photo. */
export async function loadProfiles(db, uids, { fresh = false } = {}) {
  const unique = [...new Set(uids)].filter((u) => USER_ID_RE.test(u))
  const out = {}
  await pMap(unique, async (uid) => {
    let p = fresh ? undefined : profileCache.get(uid)
    if (p === undefined) {
      p = publicProfile(await db.get(K.user(uid)))
      profileCache.set(uid, p)
    }
    if (p) out[uid] = await withPhoto(db, p)
  })
  return out
}

export function rememberProfile(user) {
  profileCache.set(user.id, publicProfile(user))
}

function deviceFrom(body) {
  const d = str(body.deviceId, 16)
  return DEVICE_ID_RE.test(d) ? d : newDeviceId()
}

const uaOf = (req) => (req?.headers?.get?.('user-agent') || '').slice(0, 300)

/** Signale aux autres appareils du compte qu'un réglage ou le profil a changé. */
async function bumpRev(db, uid, extra) {
  const res = await db.mutate(K.acct(uid), (a) => {
    a.rev = (a.rev || 0) + 1
    extra?.(a)
  })
  forgetAccount(uid)
  return res.value
}

// ---------- Création, connexion, liaison d'un appareil ----------

/** Première ouverture : un identifiant, un pseudo, un shiba et une clé, sans aucune saisie. */
export async function createAccount(db, body, req) {
  const now = Date.now()
  const lang = langOf(body.lang)
  const key = newLoginKey()
  const keyHash = await hashKey(key)
  const dev = deviceFrom(body)
  let uid = null
  for (let i = 0; i < 8 && !uid; i++) {
    const candidate = newUserId()
    const acct = {
      id: candidate,
      keyHash,
      gen: 1,
      rev: 1,
      createdAt: now,
      onboarded: false,
      keyReminderShown: false,
      settings: { sound: true, motion: 'system', lang },
      devices: {},
    }
    touchDevice(acct, dev, uaOf(req), now)
    if (await db.create(K.acct(candidate), acct)) uid = candidate
  }
  if (!uid) fail(503, 'busy', 'Impossible de créer ton compte pour le moment, réessaie.')
  const user = newUserDoc(uid, now, lang)
  await Promise.all([db.create(K.user(uid), user), db.create(K.urooms(uid), { rooms: {} })])
  const acct = await loadAccount(db, uid, { fresh: true })
  const token = await signSession(db, { uid, gen: 1, dev })
  return { token, deviceId: dev, key, me: await privateProfile(db, user, acct, dev, now) }
}

/** Reprise du compte avec l'identifiant et la clé de connexion (sur un autre appareil). */
export async function login(db, body, req) {
  const uid = normalizeUserIdInput(body.id)
  const key = normalizeKeyInput(body.key)
  ensure(USER_ID_RE.test(uid) && KEY_RE.test(key), 400, 'login_format', 'Vérifie ton identifiant (SHX-XXXXXX) et ta clé (12 caractères).')
  const now = Date.now()
  const fails = await db.get(K.loginFail(uid))
  if (fails && fails.count >= 5 && now - fails.since < 15 * 60 * 1000) {
    fail(429, 'login_locked', 'Trop d’essais. Réessaie dans quelques minutes.', { retryAfterMs: fails.since + 15 * 60 * 1000 - now })
  }
  const acct = await db.get(K.acct(uid))
  const ok = acct ? await checkKey(key, acct.keyHash) : false
  if (!ok) {
    const fresh = !fails || now - fails.since >= 15 * 60 * 1000
    await db.put(K.loginFail(uid), { count: fresh ? 1 : fails.count + 1, since: fresh ? now : fails.since })
    fail(401, 'login_failed', 'Identifiant ou clé incorrects.')
  }
  if (fails) await db.del(K.loginFail(uid)).catch(() => {})
  const dev = deviceFrom(body)
  const updated = await bumpRev(db, uid, (a) => {
    a.onboarded = true
    touchDevice(a, dev, uaOf(req), now)
  })
  const user = await db.get(K.user(uid))
  const token = await signSession(db, { uid, gen: updated.gen, dev })
  return { token, deviceId: dev, key, me: await privateProfile(db, user, updated, dev, now) }
}

export async function getMe(db, auth, req) {
  const user = await db.get(K.user(auth.uid))
  ensure(user, 404, 'not_found', 'Profil introuvable.')
  let acct = auth.acct
  const seen = acct.devices?.[auth.dev]
  const now = Date.now()
  // « Vu à l'instant » sur la liste des appareils, mis à jour au plus toutes les 10 minutes.
  if (!seen || now - seen.s > 10 * 60 * 1000) {
    const res = await db.mutate(K.acct(auth.uid), (a) => touchDevice(a, auth.dev, uaOf(req), now)).catch(() => null)
    if (res?.value) acct = res.value
    forgetAccount(auth.uid)
  }
  return { me: await privateProfile(db, user, acct, auth.dev) }
}

/** Modifie pseudo, pelage, accessoires, langue et réglages (propagé aux autres appareils). */
export async function updateMe(db, auth, body) {
  const now = Date.now()
  let user
  const userChanges = {}
  if (body.pseudo !== undefined) userChanges.pseudo = validatePseudo(str(body.pseudo, 64))
  if (body.coat !== undefined) {
    ensure(COAT_IDS.includes(body.coat), 400, 'coat', 'Pelage inconnu.')
    userChanges.coat = body.coat
  }
  if (body.acc !== undefined) userChanges.acc = Array.isArray(body.acc) ? body.acc.slice(0, 5).map((a) => str(a, 20)) : []
  if (Object.keys(userChanges).length) {
    const res = await db.mutate(K.user(auth.uid), (u) => {
      if (userChanges.pseudo) u.pseudo = userChanges.pseudo
      if (userChanges.coat) u.coat = userChanges.coat
      if (userChanges.acc) u.acc = sanitizeAccessories(userChanges.acc, u.level || 1)
      u.updatedAt = now
    })
    user = res.value
    rememberProfile(user)
  }
  const acctChanges = {}
  if (body.onboarded !== undefined) acctChanges.onboarded = bool(body.onboarded)
  if (body.keyReminderShown !== undefined) acctChanges.keyReminderShown = bool(body.keyReminderShown)
  if (body.settings && typeof body.settings === 'object') {
    const s = {}
    if (body.settings.sound !== undefined) s.sound = bool(body.settings.sound)
    if (['system', 'reduce', 'full'].includes(body.settings.motion)) s.motion = body.settings.motion
    if (LANGS.includes(body.settings.lang)) s.lang = body.settings.lang
    acctChanges.settings = s
  }
  const acct = await bumpRev(db, auth.uid, (a) => {
    if (acctChanges.onboarded !== undefined) a.onboarded = acctChanges.onboarded || a.onboarded
    if (acctChanges.keyReminderShown !== undefined) a.keyReminderShown = acctChanges.keyReminderShown || a.keyReminderShown
    if (acctChanges.settings) a.settings = { ...(a.settings || {}), ...acctChanges.settings }
  })
  user ||= await db.get(K.user(auth.uid))
  return { me: await privateProfile(db, user, acct, auth.dev, now) }
}

// ---------- Photo de profil ----------

/** Enregistre une photo (déjà recadrée et réduite par l'appli ; les métadonnées EXIF sont supprimées). */
export async function setPhoto(db, auth, body) {
  const image = str(body.image, 400000)
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  ensure(m, 400, 'image', 'Image invalide.')
  const bytes = Buffer.from(m[2], 'base64')
  ensure(bytes.length > 200 && bytes.length <= 250000, 413, 'image_size', 'Image trop lourde.')
  const v = randomString(10, LOWER_ALPHABET)
  await db.createBytes(K.photo(auth.uid, v), bytes, { type: m[1] })
  let old = null
  const res = await db.mutate(K.user(auth.uid), (u) => {
    old = u.photo || null
    u.photo = v
    u.updatedAt = Date.now()
  })
  rememberProfile(res.value)
  if (old && old !== v) await db.del(K.photo(auth.uid, old)).catch(() => {})
  const acct = await bumpRev(db, auth.uid)
  return { me: await privateProfile(db, res.value, acct, auth.dev) }
}

export async function removePhoto(db, auth) {
  let old = null
  const res = await db.mutate(K.user(auth.uid), (u) => {
    old = u.photo || null
    if (!old) return SKIP
    u.photo = null
    u.updatedAt = Date.now()
  })
  const user = res.value || (await db.get(K.user(auth.uid)))
  rememberProfile(user)
  if (old) await db.del(K.photo(auth.uid, old)).catch(() => {})
  const acct = await bumpRev(db, auth.uid)
  return { me: await privateProfile(db, user, acct, auth.dev) }
}

/** Photo servie seulement avec une adresse signée (remise aux membres des groupes de la personne). */
export async function getPhoto(db, uid, v, url) {
  const ok = USER_ID_RE.test(uid) && /^[a-z0-9]{6,16}$/.test(v) && (await checkPhotoSignature(db, uid, v, url.searchParams.get('e'), url.searchParams.get('s')))
  if (!ok) return new Response('Lien expiré', { status: plainStatus(403), headers: { 'cache-control': 'no-store' } })
  const item = await db.getBytes(K.photo(uid, v))
  if (!item) return new Response('Photo introuvable', { status: plainStatus(404), headers: { 'cache-control': 'no-store' } })
  return new Response(item.data, {
    headers: { 'content-type': item.metadata?.type || 'image/jpeg', 'cache-control': 'private, max-age=604800, immutable' },
  })
}

// ---------- Clé et QR code ----------

/** Régénère la clé : les autres appareils sont déconnectés (génération incrémentée). */
export async function regenerateKey(db, auth) {
  const key = newLoginKey()
  const keyHash = await hashKey(key)
  const acct = await bumpRev(db, auth.uid, (a) => {
    a.keyHash = keyHash
    a.gen = (a.gen || 1) + 1
    a.keyRegeneratedAt = Date.now()
    a.devices = a.devices?.[auth.dev] ? { [auth.dev]: a.devices[auth.dev] } : {}
  })
  const token = await signSession(db, { uid: auth.uid, gen: acct.gen, dev: auth.dev })
  return { key, token }
}

/** QR code de connexion : valable 10 minutes, utilisable une fois. */
export async function createLink(db, auth) {
  const now = Date.now()
  const token = newToken(24)
  await db.create(K.link(token), { uid: auth.uid, gen: auth.acct.gen, createdAt: now, exp: now + LIMITS.linkTtlMs })
  return { token, expiresAt: now + LIMITS.linkTtlMs }
}

export async function linkStatus(db, auth, token) {
  const link = await db.get(K.link(str(token, 64)))
  ensure(link && link.uid === auth.uid, 404, 'not_found', 'QR code introuvable.')
  const used = await db.get(K.linkUsed(token))
  return { used: !!used, usedAt: used?.at || null, expired: Date.now() > link.exp }
}

export async function redeemLink(db, body, req) {
  const token = str(body.token, 64)
  ensure(/^[A-Za-z0-9]{16,40}$/.test(token), 400, 'link_invalid', 'Ce QR code n’est pas valide.')
  const link = await db.get(K.link(token))
  ensure(link, 404, 'link_invalid', 'Ce QR code n’est pas valide.')
  ensure(Date.now() <= link.exp, 410, 'link_expired', 'Ce QR code a expiré. Affiche-en un nouveau depuis ton profil.')
  const current = await loadAccount(db, link.uid, { fresh: true })
  ensure(current && current.gen === link.gen, 410, 'link_expired', 'Ce QR code n’est plus valable.')
  const dev = deviceFrom(body)
  const claimed = await db.create(K.linkUsed(token), { at: Date.now(), dev })
  ensure(claimed, 410, 'link_used', 'Ce QR code a déjà servi. Affiche-en un nouveau depuis ton profil.')
  const acct = await bumpRev(db, link.uid, (a) => touchDevice(a, dev, uaOf(req), Date.now()))
  const user = await db.get(K.user(link.uid))
  const sessionToken = await signSession(db, { uid: link.uid, gen: acct.gen, dev })
  return { token: sessionToken, deviceId: dev, me: await privateProfile(db, user, acct, dev) }
}

export { authenticate, SKIP }
