// Salons privés : création, invitation (lien + code), membres, hôte, présence, liste « Mes salons ».
import { K } from './keys.js'
import { SKIP, pMap } from './db.js'
import { fail, ensure, str } from './http.js'
import { isMember, postMessage, unreadCount, historyPage } from './messages.js'
import { loadProfiles } from './users.js'
import { newRoomId, newInviteCode, normalizeInviteInput, INVITE_RE, ROOM_ID_RE, USER_ID_RE } from '../shared/ids.js'
import { cleanLine } from '../shared/text.js'
import { containsBanned } from '../shared/moderation.js'
import { LIMITS } from '../shared/constants.js'
import { parisWeek, previousWeek } from '../shared/time.js'

export function validateRoomName(input) {
  const name = cleanLine(str(input, 120))
  const len = Array.from(name).length
  ensure(len >= LIMITS.roomNameMin && len <= LIMITS.roomNameMax, 400, 'room_name', 'Le nom du salon doit faire entre 3 et 30 caractères.')
  ensure(!containsBanned(name), 400, 'room_name_banned', 'Ce nom n’est pas autorisé. Choisis-en un autre.')
  return name
}

export async function loadRoom(db, rid) {
  ensure(ROOM_ID_RE.test(String(rid)), 404, 'room_not_found', 'Salon introuvable.')
  const room = await db.get(K.room(rid))
  ensure(room, 404, 'room_not_found', 'Salon introuvable.')
  return room
}

export async function loadMemberRoom(db, auth, rid) {
  const room = await loadRoom(db, rid)
  ensure(isMember(room, auth.uid), 403, 'not_member', 'Tu ne fais pas (ou plus) partie de ce salon.')
  return room
}

async function allocateInvite(db, rid) {
  for (let i = 0; i < 10; i++) {
    const code = newInviteCode()
    if (await db.create(K.invite(code), { rid, active: true, at: Date.now() })) return code
  }
  fail(503, 'busy', 'Impossible de créer un code d’invitation, réessaie.')
}

async function addUserRoom(db, uid, rid, now) {
  await db.mutate(
    K.urooms(uid),
    (u) => {
      u.rooms ||= {}
      if (u.rooms[rid]) return SKIP
      u.rooms[rid] = { joinedAt: now, readTs: now }
    },
    { create: () => ({ rooms: {} }) },
  )
}

async function removeUserRoom(db, uid, rid) {
  await db
    .mutate(K.urooms(uid), (u) => {
      if (!u.rooms?.[rid]) return SKIP
      delete u.rooms[rid]
    })
    .catch(() => {})
}

/** Vue d'un salon pour un membre. */
export function roomInfo(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    createdAt: room.createdAt,
    mv: room.mv,
    invite: room.invite?.code || null,
    memberIds: room.members.map((m) => m.id),
    game: room.game || null,
  }
}

export async function roomMembers(db, room, { fresh = false } = {}) {
  const profiles = await loadProfiles(db, room.members.map((m) => m.id), { fresh })
  return room.members.map((m) => ({
    ...(profiles[m.id] || { id: m.id, pseudo: 'Shiba', coat: 'roux', acc: [], level: 1 }),
    joinedAt: m.joinedAt,
    host: m.id === room.hostId,
  }))
}

export async function createRoom(db, auth, body) {
  const name = validateRoomName(body.name)
  const now = Date.now()
  const user = await db.get(K.user(auth.uid))
  let rid = null
  let room = null
  for (let i = 0; i < 5 && !rid; i++) {
    const candidate = newRoomId()
    const code = await allocateInvite(db, candidate)
    room = {
      id: candidate,
      name,
      hostId: auth.uid,
      createdBy: auth.uid,
      createdAt: now,
      members: [{ id: auth.uid, joinedAt: now }],
      mv: 1,
      invite: { code, at: now },
      joiners: [],
      game: null,
      lastGame: null,
      podiumDone: previousWeek(parisWeek(now)),
    }
    if (await db.create(K.room(candidate), room)) rid = candidate
  }
  if (!rid) fail(503, 'busy', 'Impossible de créer le salon pour le moment.')
  await addUserRoom(db, auth.uid, rid, now)
  await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'created', uid: auth.uid, pseudo: user.pseudo, name } })
  return { room: roomInfo(room) }
}

/** Aperçu d'une invitation avant de rejoindre. */
export async function invitePreview(db, auth, codeInput) {
  const code = normalizeInviteInput(codeInput)
  ensure(INVITE_RE.test(code), 404, 'invite_unknown', 'Ce code d’invitation n’existe pas.')
  const inv = await db.get(K.invite(code))
  ensure(inv, 404, 'invite_unknown', 'Ce code d’invitation n’existe pas.')
  const room = await db.get(K.room(inv.rid))
  ensure(room, 404, 'invite_unknown', 'Ce salon n’existe plus.')
  const base = { room: { id: room.id, name: room.name, memberCount: room.members.length } }
  if (isMember(room, auth.uid)) return { ...base, status: 'member' }
  if (!inv.active || room.invite?.code !== code) return { ...base, status: 'expired' }
  if (room.members.length >= LIMITS.roomMaxMembers) return { ...base, status: 'full' }
  return { ...base, status: 'ok' }
}

export async function joinRoom(db, auth, codeInput) {
  const code = normalizeInviteInput(codeInput)
  ensure(INVITE_RE.test(code), 404, 'invite_unknown', 'Ce code d’invitation n’existe pas.')
  const inv = await db.get(K.invite(code))
  ensure(inv, 404, 'invite_unknown', 'Ce code d’invitation n’existe pas.')
  ensure(inv.active, 410, 'invite_expired', 'Invitation expirée : demande un nouveau lien à l’hôte du salon.')
  const now = Date.now()
  let already = false
  let becameGolden = null
  const res = await db.mutate(K.room(inv.rid), (room) => {
    if (isMember(room, auth.uid)) {
      already = true
      return SKIP
    }
    ensure(room.invite?.code === code, 410, 'invite_expired', 'Invitation expirée : demande un nouveau lien à l’hôte du salon.')
    ensure(room.members.length < LIMITS.roomMaxMembers, 409, 'room_full', 'Salon complet : 20 membres au maximum.')
    room.members.push({ id: auth.uid, joinedAt: now })
    room.mv = (room.mv || 0) + 1
    room.joiners ||= []
    if (auth.uid !== room.createdBy && !room.joiners.includes(auth.uid) && room.joiners.length < 3) {
      room.joiners.push(auth.uid)
      if (room.joiners.length === 3) becameGolden = room.createdBy
    }
  })
  ensure(!res.missing, 404, 'invite_unknown', 'Ce salon n’existe plus.')
  const room = res.value
  await addUserRoom(db, auth.uid, room.id, now)
  if (!already) {
    const user = await db.get(K.user(auth.uid))
    await postMessage(db, room.id, { author: 'sys', type: 'sys', sys: { kind: 'join', uid: auth.uid, pseudo: user?.pseudo || 'Un shiba' } })
    if (becameGolden) {
      await db
        .mutate(K.user(becameGolden), (u) => {
          u.badges ||= {}
          if (u.badges.hote_en_or) return SKIP
          u.badges.hote_en_or = now
        })
        .catch(() => {})
    }
  }
  return { room: roomInfo(room), already }
}

export async function leaveRoom(db, auth, rid) {
  let newHost = null
  const res = await db.mutate(K.room(rid), (room) => {
    if (!isMember(room, auth.uid)) return SKIP
    room.members = room.members.filter((m) => m.id !== auth.uid)
    room.mv = (room.mv || 0) + 1
    newHost = null
    if (room.hostId === auth.uid) {
      const next = [...room.members].sort((a, b) => a.joinedAt - b.joinedAt)[0]
      room.hostId = next ? next.id : null
      newHost = room.hostId
    }
  })
  await removeUserRoom(db, auth.uid, rid)
  if (res.changed) {
    const [user, hostUser] = await Promise.all([db.get(K.user(auth.uid)), newHost ? db.get(K.user(newHost)) : null])
    await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'leave', uid: auth.uid, pseudo: user?.pseudo || 'Un shiba' } })
    if (hostUser) await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'host', uid: newHost, pseudo: hostUser.pseudo } })
  }
  return { ok: true, room: res.value }
}

export async function kickMember(db, auth, rid, body) {
  const target = str(body.uid, 20)
  ensure(USER_ID_RE.test(target), 400, 'uid', 'Membre inconnu.')
  ensure(target !== auth.uid, 400, 'self', 'Pour partir, utilise « Quitter le salon ».')
  const res = await db.mutate(K.room(rid), (room) => {
    ensure(room.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte peut retirer un membre.')
    if (!isMember(room, target)) return SKIP
    room.members = room.members.filter((m) => m.id !== target)
    room.mv = (room.mv || 0) + 1
  })
  ensure(!res.missing, 404, 'room_not_found', 'Salon introuvable.')
  if (res.changed) {
    await removeUserRoom(db, target, rid)
    const user = await db.get(K.user(target))
    await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'kick', uid: target, pseudo: user?.pseudo || 'Un shiba' } })
  }
  return { room: roomInfo(res.value) }
}

export async function renameRoom(db, auth, rid, body) {
  const name = validateRoomName(body.name)
  const res = await db.mutate(K.room(rid), (room) => {
    ensure(room.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte peut renommer le salon.')
    if (room.name === name) return SKIP
    room.name = name
    room.mv = (room.mv || 0) + 1
  })
  ensure(!res.missing, 404, 'room_not_found', 'Salon introuvable.')
  if (res.changed) await postMessage(db, rid, { author: 'sys', type: 'sys', sys: { kind: 'rename', name } })
  return { room: roomInfo(res.value) }
}

/** Réinitialise lien et code : l'ancien lien affichera « Invitation expirée ». */
export async function resetInvite(db, auth, rid) {
  const room = await loadMemberRoom(db, auth, rid)
  ensure(room.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte peut réinitialiser l’invitation.')
  const code = await allocateInvite(db, rid)
  let oldCode = null
  const res = await db.mutate(K.room(rid), (r) => {
    ensure(r.hostId === auth.uid, 403, 'not_host', 'Seul l’hôte peut réinitialiser l’invitation.')
    oldCode = r.invite?.code || null
    r.invite = { code, at: Date.now() }
    r.mv = (r.mv || 0) + 1
  })
  if (oldCode && oldCode !== code) await db.put(K.invite(oldCode), { rid, active: false, at: Date.now() })
  return { room: roomInfo(res.value) }
}

// ---------- Présence : pastille pour les membres actifs dans les 30 dernières secondes ----------

export async function touchPresence(db, rid, uid, current, now = Date.now()) {
  if (current?.[uid] && now - current[uid] < 12000) return
  await db
    .mutate(
      K.presence(rid),
      (p) => {
        if (p[uid] && now - p[uid] < 12000) return SKIP
        p[uid] = now
        for (const k of Object.keys(p)) if (k !== '_rev' && now - p[k] > 86400000) delete p[k]
      },
      { create: () => ({}), attempts: 3 },
    )
    .catch(() => {})
}

export function presenceMap(doc, room) {
  const out = {}
  if (!doc) return out
  for (const m of room.members) if (doc[m.id]) out[m.id] = doc[m.id]
  return out
}

/** Ouverture d'un salon : infos, membres, 50 derniers messages, réactions, présence, curseur de lecture. */
export async function openRoom(db, auth, rid) {
  const room = await loadMemberRoom(db, auth, rid)
  const [members, page, pres, urooms] = await Promise.all([
    roomMembers(db, room),
    historyPage(db, rid, null),
    db.get(K.presence(rid)),
    db.get(K.urooms(auth.uid)),
  ])
  const readTs = urooms?.rooms?.[rid]?.readTs || 0
  await touchPresence(db, rid, auth.uid, pres)
  return { room: roomInfo(room), members, ...page, readTs, presence: { ...presenceMap(pres, room), [auth.uid]: Date.now() } }
}

/** Liste « Mes salons » : dernier message, non lus et partie en cours. */
export async function listMyRooms(db, auth, now = Date.now()) {
  const urooms = (await db.get(K.urooms(auth.uid))) || { rooms: {} }
  const entries = Object.entries(urooms.rooms || {})
  const stale = []
  const rooms = (
    await pMap(entries, async ([rid, info]) => {
      const [room, last] = await Promise.all([db.get(K.room(rid)), db.get(K.roomLast(rid))])
      if (!room || !isMember(room, auth.uid)) {
        stale.push(rid)
        return null
      }
      const unread = await unreadCount(db, rid, auth.uid, info.readTs || 0, last?.ts || 0, now)
      return {
        id: rid,
        name: room.name,
        hostId: room.hostId,
        memberCount: room.members.length,
        last: last?.id ? { ts: last.ts, author: last.author, pseudo: last.pseudo, preview: last.preview, type: last.type } : null,
        unread,
        readTs: info.readTs || 0,
        game: room.game ? { id: room.game.id, type: room.game.type, status: room.game.status } : null,
        activity: Math.max(last?.ts || 0, room.createdAt || 0, info.joinedAt || 0),
      }
    }, 8)
  ).filter(Boolean)
  if (stale.length) {
    await db
      .mutate(K.urooms(auth.uid), (u) => {
        let changed = false
        for (const rid of stale) {
          if (u.rooms?.[rid]) {
            delete u.rooms[rid]
            changed = true
          }
        }
        return changed ? undefined : SKIP
      })
      .catch(() => {})
  }
  rooms.sort((a, b) => b.activity - a.activity)
  return rooms
}

/** Mémorise la position de lecture (seulement vers l'avant). */
export async function markRead(db, uid, rid, ts) {
  if (!(ts > 0)) return
  await db
    .mutate(K.urooms(uid), (u) => {
      const r = u.rooms?.[rid]
      if (!r || (r.readTs || 0) >= ts) return SKIP
      r.readTs = Math.min(ts, Date.now())
    })
    .catch(() => {})
}

