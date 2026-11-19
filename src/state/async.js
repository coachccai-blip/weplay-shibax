// Jeux dans la conversation : création depuis le hub, coups joués depuis la carte du fil.
// L'état de chaque jeu vit dans le salon ouvert (room.asyncGames) et suit l'interrogation du salon.
import { api } from '../lib/transport.js'
import { room, updateRoom, mergeAsync } from './rooms.js'
import { syncSoon } from './bus.js'

/** Range un état de jeu reçu (réponse d'un coup, chargement d'une carte). */
export function putAsync(game) {
  if (!game || room.value?.rid !== game.rid) return
  updateRoom((cur) => ({ asyncGames: mergeAsync(cur.asyncGames || {}, [game]) }))
}

const loading = new Set()

/** Carte d'un jeu ancien (plus suivi par l'interrogation) : chargée une fois à l'affichage. */
export async function loadAsync(id) {
  if (loading.has(id)) return
  loading.add(id)
  const rid = room.value?.rid
  try {
    const res = await api.get(`async/${id}`)
    putAsync(res.game)
  } catch (err) {
    if (room.value?.rid === rid && ['game_not_found', 'not_found', 'not_member', 'room_not_found'].includes(err.code)) {
      updateRoom((cur) => ({ asyncGames: { ...(cur.asyncGames || {}), [id]: { id, missing: true, v: 0 } } }))
    }
  } finally {
    setTimeout(() => loading.delete(id), 4000)
  }
}

export async function createAsync(rid, type, options = {}, image = null) {
  const res = await api.post(`rooms/${rid}/async`, { type, options, ...(image ? { image } : {}) }, { timeout: 30000 })
  putAsync(res.game)
  syncSoon()
  return res.game
}

/** Joue un coup ; renvoie la réponse du serveur ({ game, outcome? }). */
export async function actAsync(id, body) {
  try {
    const res = await api.post(`async/${id}/act`, body)
    putAsync(res.game)
    syncSoon()
    return res
  } catch (err) {
    if (err.game) putAsync(err.game)
    throw err
  }
}

export function fetchSuggestions(lang) {
  return api.get(`async/suggest?lang=${encodeURIComponent(lang)}`)
}
