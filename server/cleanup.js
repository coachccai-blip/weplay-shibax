// Ménage quotidien : messages de plus de 90 jours, dessins de plus de 30 jours,
// données temporaires des parties, liens de connexion expirés. Travail borné dans le temps.
import { K, lastSegment } from './keys.js'
import { pMap, SKIP } from './db.js'
import { LIMITS } from '../shared/constants.js'
import { utcBucket } from '../shared/time.js'

const DAY = 86400000
const STATE_KEY = 'cfg/cleanup'

async function deletePrefix(db, prefix, deadline) {
  const keys = await db.keys(prefix)
  let n = 0
  await pMap(keys, async (k) => {
    if (Date.now() > deadline) return
    await db.del(k).catch(() => {})
    n++
  }, 16)
  return n
}

export async function runCleanup(db, { budgetMs = 22000, now = Date.now() } = {}) {
  const deadline = Date.now() + budgetMs
  const report = { messagesDays: 0, deleted: 0, games: 0, links: 0, partial: false }
  const msgLimit = utcBucket(now - LIMITS.messagesRetentionDays * DAY).day
  const drawLimit = utcBucket(now - LIMITS.drawingsRetentionDays * DAY).day
  const tempLimit = utcBucket(now - 2 * DAY).day

  // 1. Messages, réactions et anti-doublons expirés, salon par salon.
  const rooms = (await db.keys('room/')).map(lastSegment)
  for (const rid of rooms) {
    if (Date.now() > deadline) {
      report.partial = true
      break
    }
    const [msgDays, rxDays, cidDays] = await Promise.all([db.dirs(K.msgRoomPrefix(rid)), db.dirs(`rx/${rid}/`), db.dirs(`cid/${rid}/`)])
    for (const dir of msgDays.map(lastSegment).filter((d) => d < msgLimit)) {
      report.deleted += await deletePrefix(db, `msg/${rid}/${dir}/`, deadline)
      report.messagesDays++
    }
    for (const dir of rxDays.map(lastSegment).filter((d) => d < msgLimit)) report.deleted += await deletePrefix(db, `rx/${rid}/${dir}/`, deadline)
    for (const dir of cidDays.map(lastSegment).filter((d) => d < tempLimit)) report.deleted += await deletePrefix(db, `cid/${rid}/${dir}/`, deadline)
  }

  // 2. Parties : données temporaires après 2 jours, partie et dessins après 30 jours.
  const state = (await db.get(STATE_KEY)) || { tempDoneUpTo: '00000000' }
  const games = (await db.keys('game/')).map(lastSegment)
  let tempDone = state.tempDoneUpTo
  for (const gid of games.sort()) {
    if (Date.now() > deadline) {
      report.partial = true
      break
    }
    const day = gid.slice(0, 8)
    if (day < drawLimit) {
      for (const p of [`gx/${gid}/`, `hb/${gid}/`, `img/${gid}/`, `fx/${gid}/`]) report.deleted += await deletePrefix(db, p, deadline)
      await db.del(K.game(gid)).catch(() => {})
      report.games++
    } else if (day < tempLimit && day > state.tempDoneUpTo) {
      for (const p of [`gx/${gid}/`, `hb/${gid}/`, `fx/${gid}/`]) report.deleted += await deletePrefix(db, p, deadline)
      if (day > tempDone) tempDone = day
    }
  }
  if (!report.partial && tempDone !== state.tempDoneUpTo) {
    await db.mutate(STATE_KEY, (s) => {
      if (s.tempDoneUpTo >= tempDone) return SKIP
      s.tempDoneUpTo = tempDone
    }, { create: () => ({ tempDoneUpTo: '00000000' }) })
  }

  // 3. Jeux de conversation de plus de 30 jours (état, dessin).
  const asyncIds = (await db.keys('ag/')).map(lastSegment)
  for (const id of asyncIds) {
    if (Date.now() > deadline) {
      report.partial = true
      break
    }
    if (id.slice(0, 8) < drawLimit) {
      await Promise.all([db.del(K.asyncGame(id)), db.del(K.asyncImage(id)), db.del(K.asyncRematch(id))]).catch(() => {})
      report.games++
    }
  }

  // 4. QR codes de connexion expirés.
  const links = await db.keys('link/')
  await pMap(links, async (key) => {
    if (Date.now() > deadline) return
    const link = await db.get(key)
    if (!link || link.exp < now - 3600000) {
      const token = lastSegment(key)
      await Promise.all([db.del(key), db.del(K.linkUsed(token))]).catch(() => {})
      report.links++
    }
  }, 8)

  return report
}
