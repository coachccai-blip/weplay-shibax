// Interrogation adaptative : toutes les secondes en partie, toutes les 3 s dans un salon ouvert,
// toutes les 5 s sinon ; en pause quand l'onglet est masqué (rattrapage en une requête au retour).
import { poll } from '../lib/transport.js'
import { route } from '../lib/router.js'
import { layout } from '../lib/layout.js'
import { room, roomCursor, applyRoomSync, applyRoomsList } from './rooms.js'
import { game, gameCursor, applyGameSync } from './game.js'
import { atBottom } from '../screens/Room.js'
import { bus } from './bus.js'
import { applyMeRev } from './core.js'

let poller = null
let tick = 0

function plan() {
  tick++
  const r = route.value
  const lay = layout.value
  const body = {}
  const inGame = r.name === 'game' && game.value?.gid === r.params.gid
  const inRoom = (r.name === 'room' || r.name === 'hub') && room.value?.rid === r.params.rid
  const listVisible = lay !== 'mobile' || r.name === 'home'
  let interval = 5000
  if (inGame) {
    // Toutes les secondes en partie ; un peu plus souvent pour les devineurs pendant le dessin,
    // pour que le dessin apparaisse en moins de 1,5 s.
    const gs = game.value?.view?.g
    const watching = game.value?.view?.status === 'playing' && gs?.phase === 'drawing' && !gs.isDrawer
    interval = watching ? 800 : 1000
  } else if (inRoom) interval = 3000
  const roomsEvery = inGame ? 8 : inRoom ? 2 : 1
  if ((listVisible && tick % roomsEvery === 0) || r.name === 'home') body.rooms = true
  if (inRoom) {
    const reading = r.name === 'room' && atBottom.value && document.hasFocus()
    const c = roomCursor({ reading })
    if (c) body.room = c
  }
  if (inGame) {
    const c = gameCursor()
    if (c) body.game = c
  }
  if (!body.rooms && !body.room && !body.game && tick % 3 === 0) body.rooms = true
  return { body: Object.keys(body).length ? body : null, interval }
}

function onResult(res, body) {
  if (res.meRev !== undefined) applyMeRev(res.meRev)
  if (res.rooms && Array.isArray(res.rooms)) applyRoomsList(res.rooms)
  if (res.room && body.room) applyRoomSync(res.room, body.room)
  if (res.game && body.game) applyGameSync(res.game, body.game)
}

export function startSync() {
  if (poller) return
  poller = poll(plan, onResult)
  bus.syncNow = () => poller?.now()
}

export function stopSync() {
  poller?.stop()
  poller = null
  bus.syncNow = null
}
