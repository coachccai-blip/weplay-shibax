// Salons : liste « Mes salons », salon ouvert, messages (envoi optimiste), réactions, présence.
import { signal } from '@preact/signals'
import { api, ApiError } from '../lib/transport.js'
import { serverNow } from '../lib/clock.js'
import { me, toast, errorToast } from './core.js'
import { play } from '../lib/fx.js'
import { LIMITS } from '../../shared/constants.js'
import { graphemeLength, cleanMessage } from '../../shared/text.js'
import { randomString, LOWER_ALPHABET } from '../../shared/ids.js'

export const rooms = signal([])
export const roomsLoaded = signal(false)
/** Salon ouvert. */
export const room = signal(null)
/** Pause imposée par l'anti-rafale (horodatage de fin). */
export const slowUntil = signal(0)

const RECENT_WINDOW = 20000

function utcDay(ts) {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

function sortMessages(list) {
  return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function mergeMessages(current, incoming) {
  const confirmedCids = new Set(incoming.map((m) => m.cid).filter(Boolean))
  const map = new Map()
  for (const m of current) {
    // Un message confirmé par le serveur remplace sa version « en cours d'envoi ».
    if (m.local && confirmedCids.has(m.clientId)) continue
    map.set(m.id, m)
  }
  for (const m of incoming) map.set(m.id, m)
  return sortMessages([...map.values()])
}

export function updateRoom(patch) {
  if (!room.value) return
  room.value = { ...room.value, ...(typeof patch === 'function' ? patch(room.value) : patch) }
}

// ---------- Liste des salons ----------

export async function loadRooms() {
  try {
    const res = await api.get('rooms')
    rooms.value = res.rooms
    roomsLoaded.value = true
  } catch (err) {
    if (!roomsLoaded.value) errorToast(err)
  }
}

export function applyRoomsList(list) {
  if (!Array.isArray(list)) return
  const open = room.value?.rid
  rooms.value = list.map((r) => (r.id === open ? { ...r, unread: 0 } : r))
  roomsLoaded.value = true
}

export async function createRoom(name) {
  const res = await api.post('rooms', { name })
  await loadRooms()
  return res.room
}

export async function previewInvite(code) {
  return api.get(`invites/${encodeURIComponent(code)}`)
}

export async function joinByCode(code) {
  const res = await api.post(`invites/${encodeURIComponent(code)}/join`)
  await loadRooms()
  return res.room
}

// ---------- Salon ouvert ----------

export async function openRoom(rid) {
  if (room.value?.rid === rid && !room.value.error) return
  room.value = { rid, loading: true, messages: [], members: [], reactions: {}, rxHash: {}, presence: {}, info: null, hasMore: false }
  try {
    const res = await api.get(`rooms/${rid}`)
    if (room.value?.rid !== rid) return
    const days = {}
    const myId = me.value?.id
    const firstUnread = res.readTs ? res.messages.find((m) => m.ts > res.readTs && m.author !== myId && m.author !== 'sys') : null
    room.value = {
      rid,
      loading: false,
      separatorId: firstUnread?.id || null,
      info: res.room,
      members: res.members,
      messages: sortMessages(res.messages),
      hasMore: res.hasMore,
      reactions: res.reactions || {},
      rxHash: days,
      presence: res.presence || {},
      readTs: res.readTs || 0,
      separatorTs: res.readTs || 0,
      game: null,
    }
    rooms.value = rooms.value.map((r) => (r.id === rid ? { ...r, unread: 0 } : r))
  } catch (err) {
    if (room.value?.rid !== rid) return
    room.value = { rid, loading: false, error: err, messages: [], members: [], reactions: {}, rxHash: {}, presence: {} }
  }
}

export function closeRoom() {
  room.value = null
}

/** Curseurs envoyés à chaque interrogation du salon. */
export function roomCursor({ reading }) {
  const r = room.value
  if (!r || r.loading || r.error || !r.info) return null
  const confirmed = r.messages.filter((m) => !m.pending && !m.failed && !m.local)
  const last = confirmed.at(-1)
  const lastTs = last?.ts || serverNow()
  const recent = confirmed.filter((m) => m.ts >= lastTs - RECENT_WINDOW).map((m) => m.id)
  const days = [...new Set(confirmed.slice(-60).map((m) => utcDay(m.ts)))].slice(-3)
  const rx = {}
  for (const d of days) rx[d] = r.rxHash[d] || ''
  const cursor = { rid: r.rid, after: last?.id || null, recent, rx, mv: r.info.mv }
  if (reading && last && last.ts > (r.readTs || 0)) cursor.read = last.ts
  return cursor
}

export function applyRoomSync(res, sent) {
  const r = room.value
  if (!r || !sent || r.rid !== sent.rid) return
  if (res.error) return
  if (res.removed) {
    room.value = { ...r, removed: true }
    return
  }
  if (res.reset) {
    reloadLatest()
    return
  }
  const incoming = res.messages || []
  const fromOthers = incoming.filter((m) => m.author !== me.value?.id && !r.messages.some((x) => x.id === m.id))
  const reactions = { ...r.reactions }
  const rxHash = { ...r.rxHash }
  for (const day of res.reactions || []) {
    rxHash[day.day] = day.hash
    // Remplace les réactions des messages de ce jour.
    for (const m of r.messages) if (utcDay(m.ts) === day.day) delete reactions[m.id]
    Object.assign(reactions, day.byMsg)
  }
  const next = {
    ...r,
    info: res.room || r.info,
    messages: incoming.length ? mergeMessages(r.messages, incoming) : r.messages,
    presence: res.presence || r.presence,
    reactions,
    rxHash,
    game: res.game,
  }
  if (res.members) next.members = res.members
  if (sent.read) next.readTs = Math.max(r.readTs || 0, sent.read)
  room.value = next
  if (fromOthers.length) play('pop')
  if (r.game && r.game.status !== res.game?.status && !res.game) reloadLatest()
}

async function reloadLatest() {
  const r = room.value
  if (!r) return
  try {
    const res = await api.get(`rooms/${r.rid}`)
    if (room.value?.rid !== r.rid) return
    updateRoom((cur) => ({
      info: res.room,
      members: res.members,
      messages: mergeMessages(cur.messages, res.messages),
      reactions: { ...cur.reactions, ...res.reactions },
      presence: res.presence,
    }))
  } catch {
    /* prochaine interrogation */
  }
}

export async function loadOlder() {
  const r = room.value
  if (!r || r.loadingOlder || !r.hasMore) return
  const oldest = r.messages.find((m) => !m.pending && !m.failed)
  if (!oldest) return
  updateRoom({ loadingOlder: true })
  try {
    const res = await api.get(`rooms/${r.rid}/messages?before=${encodeURIComponent(oldest.id)}`)
    if (room.value?.rid !== r.rid) return
    updateRoom((cur) => ({
      loadingOlder: false,
      hasMore: res.hasMore,
      messages: mergeMessages(cur.messages, res.messages),
      reactions: { ...res.reactions, ...cur.reactions },
    }))
  } catch (err) {
    updateRoom({ loadingOlder: false })
    errorToast(err)
  }
}

// ---------- Envoi de messages ----------

const sentTimes = []

export function canSendNow() {
  const now = Date.now()
  while (sentTimes.length && now - sentTimes[0] > LIMITS.burstWindowMs) sentTimes.shift()
  if (slowUntil.value > now) return false
  if (sentTimes.length >= LIMITS.burstCount) {
    slowUntil.value = sentTimes[0] + LIMITS.burstWindowMs + LIMITS.burstPauseMs
    return false
  }
  return true
}

function newClientId() {
  return `${Date.now().toString(36)}${randomString(8, LOWER_ALPHABET)}`
}

async function deliver(rid, local) {
  try {
    const res = await api.post(`rooms/${rid}/messages`, { text: local.text, clientId: local.clientId }, { retries: 2 })
    if (room.value?.rid !== rid) return
    updateRoom((cur) => {
      const without = cur.messages.filter((m) => m.id !== local.id)
      return { messages: mergeMessages(without, [res.message]) }
    })
    play('send')
  } catch (err) {
    if (room.value?.rid !== rid) return
    if (err instanceof ApiError && err.code === 'slow_down') slowUntil.value = Date.now() + (err.retryAfterMs || 5000)
    updateRoom((cur) => ({
      messages: cur.messages.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true, error: err.message } : m)),
    }))
  }
}

export function sendMessage(rawText) {
  const r = room.value
  const text = cleanMessage(rawText)
  if (!r || !text) return false
  if (graphemeLength(text) > LIMITS.messageMax) {
    toast('500 caractères au plus par message.', 'error')
    return false
  }
  if (!canSendNow()) return false
  sentTimes.push(Date.now())
  const clientId = newClientId()
  const user = me.value
  const local = {
    id: `~${clientId}`,
    clientId,
    ts: serverNow(),
    author: user.id,
    type: 'text',
    text,
    a: { p: user.pseudo, c: user.coat, x: user.acc },
    pending: true,
    local: true,
  }
  updateRoom((cur) => ({ messages: [...cur.messages, local] }))
  deliver(r.rid, local)
  return true
}

export function retryMessage(localId) {
  const r = room.value
  const local = r?.messages.find((m) => m.id === localId)
  if (!local) return
  if (!canSendNow()) return
  sentTimes.push(Date.now())
  updateRoom((cur) => ({ messages: cur.messages.map((m) => (m.id === localId ? { ...m, pending: true, failed: false } : m)) }))
  deliver(r.rid, { ...local, pending: true, failed: false })
}

export function discardMessage(localId) {
  updateRoom((cur) => ({ messages: cur.messages.filter((m) => m.id !== localId) }))
}

export async function toggleReaction(msgId, reaction) {
  const r = room.value
  if (!r || msgId.startsWith('~')) return
  const uid = me.value.id
  // Mise à jour optimiste : une réaction par membre et par message.
  const before = r.reactions[msgId] || {}
  const had = before[reaction]?.includes(uid)
  const optimistic = {}
  for (const [k, list] of Object.entries(before)) {
    const rest = list.filter((u) => u !== uid)
    if (rest.length) optimistic[k] = rest
  }
  if (!had) optimistic[reaction] = [...(optimistic[reaction] || []), uid]
  updateRoom((cur) => ({ reactions: { ...cur.reactions, [msgId]: optimistic } }))
  try {
    const res = await api.post(`rooms/${r.rid}/reactions`, { msgId, reaction })
    updateRoom((cur) => ({ reactions: { ...cur.reactions, [msgId]: res.reactions } }))
  } catch (err) {
    updateRoom((cur) => ({ reactions: { ...cur.reactions, [msgId]: before } }))
    errorToast(err)
  }
}

// ---------- Gestion du salon ----------

export async function renameRoom(name) {
  const r = room.value
  const res = await api.patch(`rooms/${r.rid}`, { name })
  updateRoom({ info: res.room })
  rooms.value = rooms.value.map((x) => (x.id === r.rid ? { ...x, name: res.room.name } : x))
}

export async function resetInvite() {
  const r = room.value
  const res = await api.post(`rooms/${r.rid}/invite`)
  updateRoom({ info: res.room })
  return res.room.invite
}

export async function kickMember(uid) {
  const r = room.value
  const res = await api.post(`rooms/${r.rid}/kick`, { uid })
  updateRoom((cur) => ({ info: res.room, members: cur.members.filter((m) => m.id !== uid) }))
}

export async function leaveRoom(rid) {
  await api.post(`rooms/${rid}/leave`)
  rooms.value = rooms.value.filter((r) => r.id !== rid)
  if (room.value?.rid === rid) room.value = null
}

export async function fetchLeaderboard(rid, scope) {
  return api.get(`rooms/${rid}/leaderboard?scope=${scope}`)
}
