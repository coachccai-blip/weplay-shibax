// Identifiants et secrets aléatoires, partagés entre le navigateur et les Functions.

/** 32 caractères : majuscules et chiffres, sans 0, O, 1 ni I. */
export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Alphabet minuscule pour les identifiants techniques (salons, parties). */
export const LOWER_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Chaîne aléatoire non biaisée (tirage par rejet). */
export function randomString(length, alphabet = ID_ALPHABET) {
  const n = alphabet.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    globalThis.crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < limit) out += alphabet[b % n]
      if (out.length === length) break
    }
  }
  return out
}

export const USER_ID_RE = /^SHX-[A-HJ-NP-Z2-9]{6}$/
export const KEY_RE = /^[A-HJ-NP-Z2-9]{12}$/
export const INVITE_RE = /^[A-HJ-NP-Z2-9]{6}$/
export const ROOM_ID_RE = /^[a-hjkmnp-z2-9]{10}$/
export const GAME_ID_RE = /^\d{8}-[a-hjkmnp-z2-9]{10}$/
export const DEVICE_ID_RE = /^[a-hjkmnp-z2-9]{8}$/

export const newUserId = () => `SHX-${randomString(6)}`
export const newLoginKey = () => randomString(12)
export const newInviteCode = () => randomString(6)
export const newRoomId = () => randomString(10, LOWER_ALPHABET)
export const newDeviceId = () => randomString(8, LOWER_ALPHABET)
export const newToken = (len = 32) => randomString(len, LOWER_ALPHABET + ID_ALPHABET)

/** Identifiant de partie : jour UTC de création + aléa (permet le ménage par date). */
export function newGameId(now = Date.now()) {
  const d = new Date(now)
  const day = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  return `${day}-${randomString(10, LOWER_ALPHABET)}`
}

/** Normalise une saisie d'identifiant : « shx abc 234 » → « SHX-ABC234 ». */
export function normalizeUserIdInput(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('SHX') ? raw.slice(3) : raw
  return `SHX-${body}`
}

export function normalizeKeyInput(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeInviteInput(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}
