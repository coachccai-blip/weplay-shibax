// Routeur de l'API (une seule Function `api`, chemin /api/*).
import { Db } from './db.js'
import { K } from './keys.js'
import { HttpError, json, errorResponse, readJson, ensure, str, noteRequestHost } from './http.js'
import { authenticate } from './auth.js'
import { createAccount, login, getMe, updateMe, regenerateKey, createLink, linkStatus, redeemLink, loadProfiles, setPhoto, removePhoto, getPhoto } from './users.js'
import { createRoom, invitePreview, joinRoom, openRoom, renameRoom, leaveRoom, kickMember, resetInvite, listMyRooms, loadMemberRoom, roomMembers } from './rooms.js'
import { sendMessage, historyPage, toggleReaction } from './messages.js'
import { leaderboard } from './rewards.js'
import { createAsync, getAsync, actAsync, getAsyncImage, asyncSuggestions, asyncChanges } from './async/index.js'
import { sync } from './sync.js'
import { createGame, getGame, getSummary, joinGame, leaveGame, updateSettings, startGame, gameAction, postStrokes, saveDrawing, getDrawing, testGameEnabled } from './games/index.js'

const PUBLIC = false
const AUTH = true

/** [méthode, motif, authentification, gestionnaire, taille max du corps] */
const ROUTES = [
  ['GET', 'health', PUBLIC, () => ({ ok: true, now: Date.now(), testGame: testGameEnabled(), dev: process.env.NETLIFY_DEV === 'true' })],
  ['POST', 'account', PUBLIC, (c) => createAccount(c.db, c.body, c.req)],
  ['POST', 'account/login', PUBLIC, (c) => login(c.db, c.body, c.req)],
  ['POST', 'link/redeem', PUBLIC, (c) => redeemLink(c.db, c.body, c.req)],
  ['GET', 'me', AUTH, (c) => getMe(c.db, c.auth, c.req)],
  ['POST', 'me/photo', AUTH, (c) => setPhoto(c.db, c.auth, c.body), 400 * 1024],
  ['POST', 'me/photo/remove', AUTH, (c) => removePhoto(c.db, c.auth)],
  ['GET', 'photos/:uid/:v', PUBLIC, (c) => getPhoto(c.db, c.params.uid, c.params.v, c.url)],
  ['PATCH', 'me', AUTH, (c) => updateMe(c.db, c.auth, c.body)],
  ['POST', 'me/key', AUTH, (c) => regenerateKey(c.db, c.auth)],
  ['POST', 'me/link', AUTH, (c) => createLink(c.db, c.auth)],
  ['GET', 'me/link/:token', AUTH, (c) => linkStatus(c.db, c.auth, c.params.token)],
  ['POST', 'sync', AUTH, (c) => sync(c.db, c.auth, c.body, c.ctx)],
  ['GET', 'rooms', AUTH, async (c) => ({ rooms: await listMyRooms(c.db, c.auth) })],
  ['POST', 'rooms', AUTH, (c) => createRoom(c.db, c.auth, c.body)],
  ['GET', 'invites/:code', AUTH, (c) => invitePreview(c.db, c.auth, c.params.code)],
  ['POST', 'invites/:code/join', AUTH, (c) => joinRoom(c.db, c.auth, c.params.code)],
  [
    'GET',
    'rooms/:rid',
    AUTH,
    async (c) => {
      // Le salon et ses jeux de conversation en cours, en parallèle (l'accès est vérifié par openRoom).
      const [room, async] = await Promise.all([openRoom(c.db, c.auth, c.params.rid), asyncChanges(c.db, c.auth, c.params.rid, {}, { limit: 14 }).catch(() => null)])
      return { ...room, async }
    },
  ],
  ['PATCH', 'rooms/:rid', AUTH, (c) => renameRoom(c.db, c.auth, c.params.rid, c.body)],
  ['POST', 'rooms/:rid/leave', AUTH, (c) => leaveRoom(c.db, c.auth, c.params.rid)],
  ['POST', 'rooms/:rid/kick', AUTH, (c) => kickMember(c.db, c.auth, c.params.rid, c.body)],
  ['POST', 'rooms/:rid/invite', AUTH, (c) => resetInvite(c.db, c.auth, c.params.rid)],
  [
    'GET',
    'rooms/:rid/messages',
    AUTH,
    async (c) => {
      await loadMemberRoom(c.db, c.auth, c.params.rid)
      return historyPage(c.db, c.params.rid, str(c.url.searchParams.get('before'), 64))
    },
  ],
  [
    'POST',
    'rooms/:rid/messages',
    AUTH,
    async (c) => {
      const [room, user] = await Promise.all([loadMemberRoom(c.db, c.auth, c.params.rid), c.db.get(K.user(c.auth.uid))])
      return sendMessage(c.db, c.auth, c.params.rid, c.body, { room, user })
    },
  ],
  [
    'POST',
    'rooms/:rid/reactions',
    AUTH,
    async (c) => toggleReaction(c.db, c.auth, c.params.rid, c.body, await loadMemberRoom(c.db, c.auth, c.params.rid)),
  ],
  ['GET', 'rooms/:rid/members', AUTH, async (c) => ({ members: await roomMembers(c.db, await loadMemberRoom(c.db, c.auth, c.params.rid)) })],
  [
    'GET',
    'rooms/:rid/leaderboard',
    AUTH,
    async (c) => {
      await loadMemberRoom(c.db, c.auth, c.params.rid)
      const board = await leaderboard(c.db, c.params.rid, c.url.searchParams.get('scope'))
      const profiles = await loadProfiles(c.db, board.entries.map((e) => e.uid))
      return { ...board, entries: board.entries.map((e) => ({ ...e, ...(profiles[e.uid] || { pseudo: 'Ancien membre', coat: 'creme', acc: [] }) })) }
    },
  ],
  ['POST', 'rooms/:rid/games', AUTH, (c) => createGame(c.db, c.auth, c.params.rid, c.body)],
  ['POST', 'rooms/:rid/async', AUTH, (c) => createAsync(c.db, c.auth, c.params.rid, c.body), 900 * 1024],
  ['GET', 'async/suggest', AUTH, (c) => asyncSuggestions(c.auth, c.url.searchParams.get('lang'))],
  ['GET', 'async/:id', AUTH, (c) => getAsync(c.db, c.auth, c.params.id)],
  ['POST', 'async/:id/act', AUTH, (c) => actAsync(c.db, c.auth, c.params.id, c.body)],
  ['GET', 'async/:id/image', PUBLIC, (c) => getAsyncImage(c.db, c.params.id)],
  ['GET', 'games/:gid', AUTH, (c) => getGame(c.db, c.auth, c.params.gid)],
  ['GET', 'games/:gid/summary', AUTH, (c) => getSummary(c.db, c.auth, c.params.gid)],
  ['POST', 'games/:gid/join', AUTH, (c) => joinGame(c.db, c.auth, c.params.gid)],
  ['POST', 'games/:gid/leave', AUTH, (c) => leaveGame(c.db, c.auth, c.params.gid)],
  ['POST', 'games/:gid/settings', AUTH, (c) => updateSettings(c.db, c.auth, c.params.gid, c.body)],
  ['POST', 'games/:gid/start', AUTH, (c) => startGame(c.db, c.auth, c.params.gid)],
  ['POST', 'games/:gid/act', AUTH, (c) => gameAction(c.db, c.auth, c.params.gid, c.body)],
  ['POST', 'games/:gid/strokes', AUTH, (c) => postStrokes(c.db, c.auth, c.params.gid, c.body), 48 * 1024],
  ['POST', 'games/:gid/drawings/:r', AUTH, (c) => saveDrawing(c.db, c.auth, c.params.gid, c.params.r, c.body), 900 * 1024],
  ['GET', 'games/:gid/drawings/:r', PUBLIC, (c) => getDrawing(c.db, c.params.gid, c.params.r)],
]

const COMPILED = ROUTES.map(([method, pattern, auth, handler, maxBody]) => ({
  method,
  parts: pattern.split('/'),
  auth,
  handler,
  maxBody,
}))

function match(method, segments) {
  let pathMatched = false
  for (const r of COMPILED) {
    if (r.parts.length !== segments.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i]
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segments[i])
      else if (p !== segments[i]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    pathMatched = true
    if (r.method === method) return { route: r, params }
  }
  return { route: null, pathMatched }
}

export async function handle(req, context) {
  try {
    const url = new URL(req.url)
    noteRequestHost(url.hostname)
    const rest = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '')
    const segments = rest ? rest.split('/') : []
    const { route, params, pathMatched } = match(req.method, segments)
    if (!route) {
      throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method' : 'not_found', pathMatched ? 'Méthode non autorisée.' : 'Route inconnue.')
    }
    const db = new Db()
    const body = await readJson(req, route.maxBody)
    const auth = route.auth ? await authenticate(db, req) : null
    const result = await route.handler({ db, req, url, params, body, auth, ctx: context })
    if (result instanceof Response) return result
    ensure(result !== undefined, 500, 'internal', 'Réponse vide.')
    return json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
