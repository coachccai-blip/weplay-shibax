// Interrogation adaptative : une seule requête rapporte les nouveautés de la liste des salons,
// du salon ouvert et de la partie en cours. Chaque partie ne renvoie que ce qui a changé.
import { K } from './keys.js'
import { HttpError, str, int } from './http.js'
import { isMember, newMessagesSince, reactionsForDay } from './messages.js'
import { listMyRooms, roomInfo, roomMembers, presenceMap, touchPresence, markRead } from './rooms.js'
import { weeklyPodium } from './rewards.js'
import { syncGame, gameSummary, advanceGame } from './games/index.js'
import { asyncChanges } from './async/index.js'
import { parisWeek, previousWeek } from '../shared/time.js'

function needsNudge(game, now) {
  if (!game) return false
  if (game.status === 'lobby') return now >= game.lobbyExpiresAt
  if (game.status === 'playing') return !!game.g && now > (game.g.phaseEnd || 0) + 4000
  return !game.rewardsDone && now - (game.endedAt || now) > 20000
}

function runInBackground(ctx, promise) {
  const p = promise.catch((e) => console.warn('[sync] tâche de fond', e?.message))
  if (ctx?.waitUntil) ctx.waitUntil(p)
  return p
}

export async function syncRoom(db, auth, body, ctx) {
  const rid = str(body.rid, 20)
  const now = Date.now()
  const room = await db.get(K.room(rid))
  if (!room || !isMember(room, auth.uid)) return { removed: true }
  const rxDays = body.rx && typeof body.rx === 'object' ? Object.entries(body.rx).slice(0, 3) : []
  const [news, pres, rx, gameState, asyncPart] = await Promise.all([
    newMessagesSince(db, rid, str(body.after, 64), body.recent, now),
    db.get(K.presence(rid)),
    Promise.all(
      rxDays.map(async ([day, hash]) => {
        if (!/^\d{8}$/.test(day)) return null
        const r = await reactionsForDay(db, rid, day)
        return r.hash === hash ? null : { day, hash: r.hash, byMsg: r.byMsg }
      }),
    ),
    room.game ? db.get(K.game(room.game.id)) : null,
    asyncChanges(db, auth, rid, body.av && typeof body.av === 'object' ? body.av : {}).catch(() => null),
  ])
  let game = gameState
  if (needsNudge(game, now)) game = (await advanceGame(db, game.id, { full: true }).catch(() => ({ state: game }))).state

  const background = [touchPresence(db, rid, auth.uid, pres, now)]
  if (int(body.read, 0) > 0) background.push(markRead(db, auth.uid, rid, int(body.read, 0)))
  if (previousWeek(parisWeek(now)) > (room.podiumDone || '')) background.push(weeklyPodium(db, rid, now))
  const bg = runInBackground(ctx, Promise.all(background))
  if (!ctx?.waitUntil) await bg

  const out = {
    room: roomInfo(room),
    messages: news.messages,
    reset: !!news.reset,
    presence: { ...presenceMap(pres, room), [auth.uid]: now },
    reactions: rx.filter(Boolean),
    game: game ? gameSummary(game) : null,
    async: asyncPart,
  }
  if (int(body.mv, -1) !== room.mv) out.members = await roomMembers(db, room)
  return out
}

function partError(err) {
  if (err instanceof HttpError) return { error: { code: err.code, message: err.message, status: err.status } }
  console.error('[sync]', err)
  return { error: { code: 'internal', message: 'Synchronisation momentanément indisponible.', status: 500 } }
}

export async function sync(db, auth, body, ctx) {
  const out = {}
  const jobs = []
  const part = (name, run) =>
    jobs.push(
      run().then(
        (value) => {
          out[name] = value
        },
        (err) => {
          out[name] = partError(err)
        },
      ),
    )
  if (body.rooms) part('rooms', () => listMyRooms(db, auth))
  if (body.room?.rid) part('room', () => syncRoom(db, auth, body.room, ctx))
  if (body.game?.gid) part('game', () => syncGame(db, auth, body.game, ctx))
  await Promise.all(jobs)
  // Révision du profil : un autre appareil du compte a changé pseudo, photo ou réglages → il se met à jour.
  out.meRev = auth.acct.rev || 0
  out.now = Date.now()
  return out
}
