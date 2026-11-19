// Messages (ajout seul, une clé par message), réactions, non lus, historique paginé.
import { K, makeMsgId, msgTs, msgAuthor, lastSegment, MSG_ID_RE } from './keys.js'
import { SKIP, pMap } from './db.js'
import { fail, ensure, str } from './http.js'
import { randomString, LOWER_ALPHABET } from '../shared/ids.js'
import { cleanMessage, graphemeLength } from '../shared/text.js'
import { LIMITS, REACTION_IDS } from '../shared/constants.js'
import { utcBucket } from '../shared/time.js'

const HOUR = 3600000
const DAY = 86400000
const OVERLAP_MS = 15000 // fenêtre relue à chaque interrogation (écritures arrivées en retard)

export function isMember(room, uid) {
  return !!room?.members?.some((m) => m.id === uid)
}

function snapshot(user) {
  return user ? { p: user.pseudo, c: user.coat, x: user.acc || [] } : null
}

/** Crée un message (clé neuve) puis met à jour l'aperçu du salon. */
export async function postMessage(db, rid, { author, type, text, cid, sys, kind, gid, agid, gtype, podium, drawings, user, ts, id }) {
  const at = ts || Date.now()
  const msgId = id || makeMsgId(at, author, randomString(5, LOWER_ALPHABET))
  const msg = { id: msgId, ts: at, author, type }
  if (type === 'text') msg.text = text
  if (cid) msg.cid = cid
  if (type === 'sys') msg.sys = sys
  if (type === 'game') Object.assign(msg, { kind, gtype, ...(gid ? { gid } : {}), ...(agid ? { agid } : {}), ...(podium ? { podium } : {}), ...(drawings ? { drawings } : {}) })
  if (user) msg.a = snapshot(user)
  const created = await db.create(K.msg(rid, msgId), msg)
  if (created) await updateLast(db, rid, msg)
  return msg
}

/** Aperçu du dernier message : registre « maximum » (seul un message plus récent le remplace). */
export async function updateLast(db, rid, msg) {
  await db
    .mutate(
      K.roomLast(rid),
      (cur) => {
        if (cur.id && cur.id >= msg.id) return SKIP
        // Aperçu structuré : le texte affiché est composé par l'appli, dans la langue de chacun.
        const last = { id: msg.id, ts: msg.ts, author: msg.author, pseudo: msg.a?.p || null, type: msg.type }
        if (msg.type === 'text') last.text = String(msg.text || '').replace(/\s+/g, ' ').slice(0, 90)
        if (msg.type === 'sys') last.sys = msg.sys
        if (msg.type === 'game') Object.assign(last, { kind: msg.kind, gtype: msg.gtype, winner: msg.podium?.[0]?.pseudo || msg.winner || null })
        return last
      },
      { create: () => ({}), attempts: 6 },
    )
    .catch((e) => console.warn('[messages] aperçu non mis à jour', e?.message))
}

function hourBuckets(fromTs, toTs) {
  const out = []
  for (let t = Math.floor(fromTs / HOUR) * HOUR; t <= toTs; t += HOUR) out.push(utcBucket(t))
  return out
}

function dayList(fromTs, toTs) {
  const out = []
  for (let t = Math.floor(fromTs / DAY) * DAY; t <= toTs; t += DAY) out.push(utcBucket(t).day)
  return out
}

async function idsInWindow(db, rid, fromTs, toTs) {
  const lists = await Promise.all(hourBuckets(fromTs, toTs).map((b) => db.keys(K.msgHourPrefix(rid, b.day, b.hour))))
  return lists.flat().map(lastSegment).filter((id) => MSG_ID_RE.test(id) && msgTs(id) >= fromTs)
}

/** Envoi d'un message texte, avec anti-rafale et protection contre les doublons (nouvel essai). */
export async function sendMessage(db, auth, rid, body, { room, user }) {
  const now = Date.now()
  ensure(isMember(room, auth.uid), 403, 'not_member', 'Tu ne fais pas partie de ce salon.')
  const text = cleanMessage(str(body.text, 4000))
  const len = graphemeLength(text)
  ensure(len >= 1, 400, 'empty', 'Ton message est vide.')
  ensure(len <= LIMITS.messageMax, 400, 'too_long', `500 caractères au plus (${len} actuellement).`)
  const clientId = str(body.clientId, 40)
  ensure(/^[a-z0-9]{12,32}$/.test(clientId), 400, 'client_id', 'Identifiant d’envoi invalide.')
  const clientTs = parseInt(clientId.slice(0, 8), 36)
  const dedupeDay = utcBucket(Math.abs(clientTs - now) < 2 * DAY ? clientTs : now).day
  const dedupeKey = K.clientMsg(rid, dedupeDay, clientId)

  // Nouvel essai d'un envoi déjà enregistré : renvoie le même message.
  const existing = await db.get(dedupeKey)
  if (existing?.id) {
    const msg = await db.get(K.msg(rid, existing.id))
    if (msg) return { message: msg, duplicate: true }
  }

  // Anti-rafale : 5 messages en 5 secondes au plus.
  const recent = (await idsInWindow(db, rid, now - LIMITS.burstWindowMs, now)).filter((id) => msgAuthor(id) === auth.uid)
  if (recent.length >= LIMITS.burstCount) {
    const oldest = Math.min(...recent.map(msgTs))
    const retryAfterMs = Math.max(1500, oldest + LIMITS.burstWindowMs + LIMITS.burstPauseMs - now)
    fail(429, 'slow_down', 'Doucement ! Attends quelques secondes avant d’envoyer un nouveau message.', { retryAfterMs })
  }

  const msgId = existing?.id || makeMsgId(now, auth.uid, randomString(5, LOWER_ALPHABET))
  if (!existing) {
    const claimed = await db.create(dedupeKey, { id: msgId, at: now })
    if (!claimed) {
      const other = await db.get(dedupeKey)
      const msg = other?.id && (await db.get(K.msg(rid, other.id)))
      if (msg) return { message: msg, duplicate: true }
    }
  }
  const message = await postMessage(db, rid, { author: auth.uid, type: 'text', text, cid: clientId, user, ts: msgTs(msgId), id: msgId })
  return { message }
}

/** Messages arrivés depuis `after` (avec une fenêtre de recouvrement, dédoublonnée par `recent`). */
export async function newMessagesSince(db, rid, after, recent, now = Date.now()) {
  const afterTs = MSG_ID_RE.test(after || '') ? msgTs(after) : now
  if (now - afterTs > 2 * HOUR) return { reset: true, messages: [] }
  const known = new Set((Array.isArray(recent) ? recent : []).slice(0, 200).map(String))
  const from = Math.min(afterTs, now) - OVERLAP_MS
  const ids = (await idsInWindow(db, rid, from, now)).filter((id) => !known.has(id) && id !== after).sort()
  const messages = (await pMap(ids, (id) => db.get(K.msg(rid, id)), 16)).filter(Boolean)
  return { messages }
}

/** Page de 50 messages avant `before` (ou les plus récents), avec leurs réactions. */
export async function historyPage(db, rid, before, limit = LIMITS.pageSize) {
  const beforeId = MSG_ID_RE.test(before || '') ? before : null
  const days = (await db.dirs(K.msgRoomPrefix(rid))).map(lastSegment).filter((d) => /^\d{8}$/.test(d)).sort().reverse()
  const startDay = beforeId ? utcBucket(msgTs(beforeId)).day : days[0]
  const candidates = days.filter((d) => !startDay || d <= startDay)
  let collected = []
  let i = 0
  for (; i < candidates.length && collected.length <= limit; i++) {
    const ids = (await db.keys(K.msgDayPrefix(rid, candidates[i])))
      .map(lastSegment)
      .filter((id) => MSG_ID_RE.test(id) && (!beforeId || id < beforeId))
      .sort()
    collected = ids.concat(collected)
  }
  const hasMore = collected.length > limit || i < candidates.length
  const ids = collected.slice(-limit)
  const messages = (await pMap(ids, (id) => db.get(K.msg(rid, id)), 24)).filter(Boolean)
  const dayset = [...new Set(messages.map((m) => utcBucket(m.ts).day))]
  const reactions = {}
  for (const d of await Promise.all(dayset.map((day) => reactionsForDay(db, rid, day)))) Object.assign(reactions, d.byMsg)
  return { messages, hasMore, reactions }
}

/** Nombre de non lus depuis `readTs` (messages des autres, hors messages système), plafonné à 100. */
export async function unreadCount(db, rid, uid, readTs, lastTs, now = Date.now()) {
  if (!lastTs || lastTs <= readTs) return 0
  const days = dayList(readTs, now)
  if (days.length > 4) return 100
  const lists = await Promise.all(days.map((day) => db.keys(K.msgDayPrefix(rid, day))))
  let n = 0
  for (const key of lists.flat()) {
    const id = lastSegment(key)
    if (!MSG_ID_RE.test(id)) continue
    const author = msgAuthor(id)
    if (msgTs(id) > readTs && author !== uid && author !== 'sys') n++
  }
  return Math.min(n, 100)
}

// ---------- Réactions : une clé par (message, membre, réaction), écrite seulement par ce membre ----------

function hashKeys(keys) {
  let h = 2166136261
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    h ^= 10
  }
  return (h >>> 0).toString(36) + keys.length.toString(36)
}

export async function reactionsForDay(db, rid, day) {
  const prefix = K.rxDayPrefix(rid, day)
  const keys = (await db.keys(prefix)).sort()
  const byMsg = {}
  for (const key of keys) {
    const rest = key.slice(prefix.length)
    const [msgId, tail] = rest.split('/')
    if (!tail) continue
    const [uid, reaction] = tail.split('~')
    if (!REACTION_IDS.includes(reaction)) continue
    byMsg[msgId] ||= {}
    ;(byMsg[msgId][reaction] ||= []).push(uid)
  }
  return { byMsg, hash: hashKeys(keys) }
}

/** Pose, change ou retire sa réaction (une par message). */
export async function toggleReaction(db, auth, rid, body, room) {
  ensure(isMember(room, auth.uid), 403, 'not_member', 'Tu ne fais pas partie de ce salon.')
  const msgId = str(body.msgId, 64)
  const reaction = str(body.reaction, 16)
  ensure(MSG_ID_RE.test(msgId), 400, 'msg_id', 'Message inconnu.')
  ensure(REACTION_IDS.includes(reaction), 400, 'reaction', 'Réaction inconnue.')
  const msg = await db.get(K.msg(rid, msgId))
  ensure(msg, 404, 'not_found', 'Ce message n’existe plus.')
  const prefix = K.rxMsgPrefix(rid, msgId)
  const mine = (await db.keys(prefix)).filter((k) => k.slice(prefix.length).startsWith(`${auth.uid}~`))
  const target = K.rx(rid, msgId, auth.uid, reaction)
  const had = mine.includes(target)
  await Promise.all(mine.map((k) => db.del(k)))
  if (!had) await db.create(target, { at: Date.now() })
  const day = utcBucket(msgTs(msgId)).day
  const { byMsg } = await reactionsForDay(db, rid, day)
  return { msgId, reactions: byMsg[msgId] || {} }
}
