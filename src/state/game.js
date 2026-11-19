// Partie ouverte : état vu par le joueur, traits reçus, propositions, présence.
import { signal } from '@preact/signals'
import { api, ApiError } from '../lib/transport.js'
import { me, errorToast } from './core.js'
import { play } from '../lib/fx.js'
import { syncSoon } from './bus.js'

export const game = signal(null)

/** Traits de la manche en cours (hors signaux : le canevas les dessine directement). */
export const strokes = {
  gid: null,
  round: -2,
  batches: new Map(),
  cursor: {},
  listeners: new Set(),
  reset(gid, round) {
    this.gid = gid
    this.round = round
    this.batches = new Map()
    this.cursor = {}
    this.emit({ reset: true })
  },
  add(list) {
    const added = []
    for (const b of list) {
      const key = `${b.d}.${b.s}`
      if (this.batches.has(key)) continue
      this.batches.set(key, b)
      added.push(b)
    }
    // Curseur : dernier lot reçu sans trou, par appareil.
    const byDev = {}
    for (const b of this.batches.values()) (byDev[b.d] ||= []).push(b.s)
    for (const [dev, seqs] of Object.entries(byDev)) {
      seqs.sort((a, b) => a - b)
      let c = -1
      for (const s of seqs) {
        if (s === c + 1) c = s
        else if (s > c + 1) break
      }
      this.cursor[dev] = c
    }
    if (added.length) this.emit({ added })
  },
  /** Lots triés de façon identique sur tous les écrans. */
  ordered() {
    return [...this.batches.values()].sort((a, b) => a.at - b.at || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.s - b.s))
  },
  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  },
  emit(evt) {
    for (const fn of this.listeners) fn(evt)
  },
}

let tickCount = 0

export function updateGame(patch) {
  if (!game.value) return
  game.value = { ...game.value, ...(typeof patch === 'function' ? patch(game.value) : patch) }
}

export async function openGame(gid) {
  if (game.value?.gid === gid && !game.value.error) return
  game.value = { gid, loading: true, view: null, guesses: [], foundIds: [], presence: {} }
  try {
    const res = await api.get(`games/${gid}`)
    if (game.value?.gid !== gid) return
    updateGame({ loading: false, view: res.game })
  } catch (err) {
    if (game.value?.gid !== gid) return
    updateGame({ loading: false, error: err })
  }
}

export function closeGame() {
  game.value = null
  strokes.reset(null, -2)
}

export function gameCursor() {
  const g = game.value
  if (!g || g.loading || g.error || !g.view) return null
  tickCount++
  const v = g.view
  const live = v.status === 'lobby' || v.status === 'playing'
  const phaseOver = v.g?.phaseEnd && Date.now() > v.g.phaseEnd
  const cursor = {
    gid: g.gid,
    beat: live && v.me.isPlayer && tickCount % 2 === 0,
    full: live && (tickCount % 4 === 0 || !!phaseOver),
  }
  if (v.status === 'playing' && v.g) {
    cursor.round = strokes.round
    cursor.strokes = strokes.cursor
    const last = g.guesses.at(-1)
    if (last) {
      const lastTs = Number(last.id.slice(0, 13))
      cursor.gAfter = last.id
      cursor.gRecent = g.guesses.filter((x) => Number(x.id.slice(0, 13)) >= lastTs - 20000).map((x) => x.id)
    }
  }
  return cursor
}

export function applyGameSync(res, sent) {
  const g = game.value
  if (!g || !sent || g.gid !== sent.gid || res.error) return
  const view = res.game
  if (!view) return
  const prev = g.view
  const round = res.round ?? -1
  const myId = me.value?.id
  let guesses = g.guesses
  let foundIds = res.foundIds || []
  if (round !== strokes.round || g.gid !== strokes.gid) {
    strokes.reset(g.gid, round)
    guesses = []
  }
  if (res.strokes?.length) strokes.add(res.strokes)
  if (res.guesses?.length) {
    const map = new Map(guesses.map((x) => [x.id, x]))
    const fresh = []
    for (const x of res.guesses) {
      if (!map.has(x.id)) fresh.push(x)
      map.set(x.id, x)
    }
    guesses = [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
    if (fresh.some((x) => x.k === 'f' && x.uid !== myId)) play('other')
  }
  // Sons des changements de phase.
  const pg = prev?.g
  const ng = view.g
  if (ng && (pg?.phase !== ng.phase || pg?.round !== ng.round)) {
    if (ng.phase === 'choosing' && ng.drawerId === myId) play('turn')
    if (ng.phase === 'reveal') play('reveal')
  }
  game.value = {
    ...g,
    view,
    guesses,
    foundIds: view.status === 'playing' ? foundIds : [],
    presence: res.presence ? { ...g.presence, ...res.presence } : g.presence,
  }
}

async function call(path, body) {
  const g = game.value
  try {
    const res = await api.post(`games/${g.gid}/${path}`, body)
    if (res.game && game.value?.gid === g.gid) updateGame({ view: res.game })
    syncSoon()
    return res
  } catch (err) {
    errorToast(err)
    throw err
  }
}

export const joinGame = () => call('join')
export const leaveGame = () => call('leave')
export const startGame = () => call('start')
export const saveSettings = (settings) => call('settings', { settings })

export async function act(body) {
  const g = game.value
  const res = await api.post(`games/${g.gid}/act`, body)
  if (body.type !== 'guess' || res.result === 'correct') syncSoon()
  return res
}

export async function createGame(rid, type = 'drawit', from = null) {
  try {
    const res = await api.post(`rooms/${rid}/games`, { type, ...(from ? { from } : {}) })
    return res.game
  } catch (err) {
    if (err instanceof ApiError && err.code === 'game_active' && err.gameId) return { id: err.gameId, existing: true }
    throw err
  }
}

export async function uploadDrawing(gid, round, dataUrl) {
  try {
    await api.post(`games/${gid}/drawings/${round}`, { image: dataUrl }, { retries: 2, timeout: 25000 })
  } catch {
    /* une miniature manquante n'empêche pas la partie */
  }
}

export async function fetchSummary(gid) {
  return api.get(`games/${gid}/summary`)
}
