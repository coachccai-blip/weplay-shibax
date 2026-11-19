// Comptes : création automatique, profil, reprise par clé, QR code, régénération de la clé.
import { K } from './keys.js'
import { SKIP, TtlCache, pMap } from './db.js'
import { fail, ensure, str, bool } from './http.js'
import { authenticate, checkKey, forgetAccount, hashKey, loadAccount, signSession } from './auth.js'
import {
  newUserId, newLoginKey, newDeviceId, newToken, normalizeKeyInput, normalizeUserIdInput,
  USER_ID_RE, KEY_RE, DEVICE_ID_RE,
} from '../shared/ids.js'
import { randomPseudo, randomCoat } from '../shared/names.js'
import { cleanLine } from '../shared/text.js'
import { containsBanned } from '../shared/moderation.js'
import { LIMITS } from '../shared/constants.js'
import { COAT_IDS, levelFromXp, rankFor, sanitizeAccessories, currentStreak } from '../shared/progression.js'
import { parisDay, dayDiff } from '../shared/time.js'

export function validatePseudo(input) {
  const pseudo = cleanLine(input)
  const len = Array.from(pseudo).length
  ensure(len >= LIMITS.pseudoMin && len <= LIMITS.pseudoMax, 400, 'pseudo_length', 'Ton pseudo doit faire entre 3 et 16 caractères.')
  ensure(/\p{L}/u.test(pseudo), 400, 'pseudo_letters', 'Ton pseudo doit contenir au moins une lettre.')
  ensure(!containsBanned(pseudo), 400, 'pseudo_banned', 'Ce pseudo n’est pas autorisé. Choisis-en un autre.')
  return pseudo
}

function newUserDoc(uid, now) {
  return {
    id: uid,
    pseudo: randomPseudo(),
    coat: randomCoat(),
    acc: [],
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

/** Profil public affiché aux autres membres. */
export function publicProfile(user) {
  if (!user) return null
  return { id: user.id, pseudo: user.pseudo, coat: user.coat, acc: user.acc || [], level: user.level || 1 }
}

/** Profil complet renvoyé à son propriétaire. */
export function privateProfile(user, acct, now = Date.now()) {
  const lv = levelFromXp(user.xp || 0)
  const today = parisDay(now)
  const streak = currentStreak(user.streak, user.streak?.last ? dayDiff(user.streak.last, today) : 99)
  return {
    ...publicProfile(user),
    xp: user.xp || 0,
    levelInfo: lv,
    rank: rankFor(lv.level),
    badges: user.badges || {},
    stats: user.stats || {},
    streak,
    playedToday: user.lastGameDay === today,
    onboarded: !!acct.onboarded,
    settings: acct.settings || { sound: true, motion: 'system' },
    keyReminderShown: !!acct.keyReminderShown,
    createdAt: acct.createdAt,
  }
}

const profileCache = new TtlCache(8000, 2000)

/** Profils publics de plusieurs utilisateurs (cache court par instance). */
export async function loadProfiles(db, uids, { fresh = false } = {}) {
  const unique = [...new Set(uids)].filter((u) => USER_ID_RE.test(u))
  const out = {}
  await pMap(unique, async (uid) => {
    let p = fresh ? undefined : profileCache.get(uid)
    if (p === undefined) {
      p = publicProfile(await db.get(K.user(uid)))
      profileCache.set(uid, p)
    }
    if (p) out[uid] = p
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

/** Première ouverture : un identifiant, un pseudo, un shiba et une clé, sans aucune saisie. */
export async function createAccount(db, body) {
  const now = Date.now()
  const key = newLoginKey()
  const keyHash = await hashKey(key)
  let uid = null
  for (let i = 0; i < 8 && !uid; i++) {
    const candidate = newUserId()
    const acct = {
      id: candidate,
      keyHash,
      gen: 1,
      createdAt: now,
      onboarded: false,
      keyReminderShown: false,
      settings: { sound: true, motion: 'system' },
    }
    if (await db.create(K.acct(candidate), acct)) uid = candidate
  }
  if (!uid) fail(503, 'busy', 'Impossible de créer ton compte pour le moment, réessaie.')
  const user = newUserDoc(uid, now)
  await Promise.all([db.create(K.user(uid), user), db.create(K.urooms(uid), { rooms: {} })])
  const dev = deviceFrom(body)
  const acct = await loadAccount(db, uid, { fresh: true })
  const token = await signSession(db, { uid, gen: 1, dev })
  return { token, deviceId: dev, key, me: privateProfile(user, acct, now) }
}

/** Reprise du compte avec l'identifiant et la clé de connexion. */
export async function login(db, body) {
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
  const user = await db.get(K.user(uid))
  const dev = deviceFrom(body)
  const token = await signSession(db, { uid, gen: acct.gen, dev })
  if (!acct.onboarded) await db.mutate(K.acct(uid), (a) => { a.onboarded = true })
  return { token, deviceId: dev, key, me: privateProfile(user, { ...acct, onboarded: true }, now) }
}

export async function getMe(db, auth) {
  const user = await db.get(K.user(auth.uid))
  ensure(user, 404, 'not_found', 'Profil introuvable.')
  return { me: privateProfile(user, auth.acct) }
}

/** Modifie pseudo, pelage, accessoires et réglages. */
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
  let acct = auth.acct
  const acctChanges = {}
  if (body.onboarded !== undefined) acctChanges.onboarded = bool(body.onboarded)
  if (body.keyReminderShown !== undefined) acctChanges.keyReminderShown = bool(body.keyReminderShown)
  if (body.settings && typeof body.settings === 'object') {
    const s = {}
    if (body.settings.sound !== undefined) s.sound = bool(body.settings.sound)
    if (['system', 'reduce', 'full'].includes(body.settings.motion)) s.motion = body.settings.motion
    acctChanges.settings = s
  }
  if (Object.keys(acctChanges).length) {
    const res = await db.mutate(K.acct(auth.uid), (a) => {
      if (acctChanges.onboarded !== undefined) a.onboarded = acctChanges.onboarded || a.onboarded
      if (acctChanges.keyReminderShown !== undefined) a.keyReminderShown = acctChanges.keyReminderShown || a.keyReminderShown
      if (acctChanges.settings) a.settings = { ...(a.settings || {}), ...acctChanges.settings }
    })
    acct = res.value
    forgetAccount(auth.uid)
  }
  user ||= await db.get(K.user(auth.uid))
  return { me: privateProfile(user, acct, now) }
}

/** Régénère la clé : les autres appareils sont déconnectés (génération incrémentée). */
export async function regenerateKey(db, auth) {
  const key = newLoginKey()
  const keyHash = await hashKey(key)
  const res = await db.mutate(K.acct(auth.uid), (a) => {
    a.keyHash = keyHash
    a.gen = (a.gen || 1) + 1
    a.keyRegeneratedAt = Date.now()
  })
  forgetAccount(auth.uid)
  const token = await signSession(db, { uid: auth.uid, gen: res.value.gen, dev: auth.dev })
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

export async function redeemLink(db, body) {
  const token = str(body.token, 64)
  ensure(/^[A-Za-z0-9]{16,40}$/.test(token), 400, 'link_invalid', 'Ce QR code n’est pas valide.')
  const link = await db.get(K.link(token))
  ensure(link, 404, 'link_invalid', 'Ce QR code n’est pas valide.')
  ensure(Date.now() <= link.exp, 410, 'link_expired', 'Ce QR code a expiré. Affiche-en un nouveau depuis ton profil.')
  const acct = await loadAccount(db, link.uid, { fresh: true })
  ensure(acct && acct.gen === link.gen, 410, 'link_expired', 'Ce QR code n’est plus valable.')
  const dev = deviceFrom(body)
  const claimed = await db.create(K.linkUsed(token), { at: Date.now(), dev })
  ensure(claimed, 410, 'link_used', 'Ce QR code a déjà servi. Affiche-en un nouveau depuis ton profil.')
  const user = await db.get(K.user(link.uid))
  const sessionToken = await signSession(db, { uid: link.uid, gen: acct.gen, dev })
  return { token: sessionToken, deviceId: dev, me: privateProfile(user, acct) }
}

export { authenticate, SKIP }
