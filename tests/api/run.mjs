// Tests d'intégration de l'API contre `netlify dev` (http://localhost:8888 par défaut).
// Lancer : netlify dev (avec SHX_ENABLE_TEST_GAME=1), puis `npm run test:api`.
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

const BASE = process.env.SHX_BASE || 'http://localhost:8888'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const results = []

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data, raw: text }
}

async function ok(token, method, path, body) {
  const r = await call(token, method, path, body)
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${r.raw}`)
  return r.data
}

async function test(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    passed++
    results.push(`✔ ${name} (${Date.now() - t0} ms)`)
    console.log(`✔ ${name} (${Date.now() - t0} ms)`)
  } catch (err) {
    results.push(`✘ ${name}\n   ${err.stack || err}`)
    console.error(`✘ ${name}\n`, err)
    process.exitCode = 1
  }
}

const clientId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 20).padEnd(12, 'x')

async function newUser() {
  const a = await ok(null, 'POST', 'account', {})
  await ok(a.token, 'PATCH', 'me', { onboarded: true })
  return a
}

const ctx = {}

await test('Compte automatique : identifiant SHX-, pseudo, shiba, clé', async () => {
  const a = await ok(null, 'POST', 'account', {})
  assert.match(a.me.id, /^SHX-[A-HJ-NP-Z2-9]{6}$/)
  assert.ok(a.me.pseudo.length >= 3 && a.me.pseudo.length <= 16)
  assert.ok(['roux', 'creme', 'sesame', 'noir'].includes(a.me.coat))
  assert.match(a.key, /^[A-HJ-NP-Z2-9]{12}$/)
  const me = await ok(a.token, 'GET', 'me')
  assert.equal(me.me.id, a.me.id)
  ctx.a = a
})

await test('Pseudo : longueur et mots interdits refusés', async () => {
  const r1 = await call(ctx.a.token, 'PATCH', 'me', { pseudo: 'ab' })
  assert.equal(r1.status, 400)
  const r2 = await call(ctx.a.token, 'PATCH', 'me', { pseudo: 'Gros connard' })
  assert.equal(r2.status, 400)
  const r3 = await ok(ctx.a.token, 'PATCH', 'me', { pseudo: 'Mochi Malicieux', onboarded: true })
  assert.equal(r3.me.pseudo, 'Mochi Malicieux')
})

await test('Reprise par identifiant + clé, puis QR code à usage unique', async () => {
  const login = await ok(null, 'POST', 'account/login', { id: ctx.a.me.id.toLowerCase().replace('-', ' '), key: ctx.a.key })
  assert.equal(login.me.id, ctx.a.me.id)
  const bad = await call(null, 'POST', 'account/login', { id: ctx.a.me.id, key: 'AAAAAAAAAAAA' })
  assert.equal(bad.status, 401)
  const link = await ok(ctx.a.token, 'POST', 'me/link')
  const st1 = await ok(ctx.a.token, 'GET', `me/link/${link.token}`)
  assert.equal(st1.used, false)
  const redeemed = await ok(null, 'POST', 'link/redeem', { token: link.token })
  assert.equal(redeemed.me.id, ctx.a.me.id)
  const again = await call(null, 'POST', 'link/redeem', { token: link.token })
  assert.equal(again.status, 410)
  const st2 = await ok(ctx.a.token, 'GET', `me/link/${link.token}`)
  assert.equal(st2.used, true)
  ctx.aSecondDevice = redeemed.token
})

await test('Régénérer la clé déconnecte les autres appareils', async () => {
  const other = await ok(null, 'POST', 'account', {})
  const second = await ok(null, 'POST', 'account/login', { id: other.me.id, key: other.key })
  const regen = await ok(other.token, 'POST', 'me/key')
  await sleep(5200) // cache de compte par instance (5 s)
  const r = await call(second.token, 'GET', 'me')
  assert.equal(r.status, 401)
  assert.equal(r.data.error.code, 'auth_revoked')
  const fresh = await ok(regen.token, 'GET', 'me')
  assert.equal(fresh.me.id, other.me.id)
})

await test('Salon : création, invitation par code, aperçu, rejoindre', async () => {
  ctx.b = await newUser()
  ctx.c = await newUser()
  ctx.d = await newUser()
  const created = await ok(ctx.a.token, 'POST', 'rooms', { name: 'Les copains' })
  ctx.rid = created.room.id
  ctx.code = created.room.invite
  assert.match(ctx.code, /^[A-HJ-NP-Z2-9]{6}$/)
  const preview = await ok(ctx.b.token, 'GET', `invites/${ctx.code}`)
  assert.equal(preview.status, 'ok')
  assert.equal(preview.room.name, 'Les copains')
  for (const u of [ctx.b, ctx.c, ctx.d]) await ok(u.token, 'POST', `invites/${ctx.code}/join`)
  const again = await ok(ctx.b.token, 'POST', `invites/${ctx.code}/join`)
  assert.equal(again.already, true)
  const room = await ok(ctx.b.token, 'GET', `rooms/${ctx.rid}`)
  assert.equal(room.members.length, 4)
  assert.ok(room.messages.some((m) => m.type === 'sys' && m.sys.kind === 'join'))
})

await test('Message reçu par les autres via l’interrogation (< 3 s)', async () => {
  const room = await ok(ctx.b.token, 'GET', `rooms/${ctx.rid}`)
  const after = room.messages.at(-1)?.id
  const t0 = Date.now()
  const sent = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/messages`, { text: 'Salut la meute ! 🐶', clientId: clientId() })
  const s = await ok(ctx.b.token, 'POST', 'sync', { room: { rid: ctx.rid, after, recent: room.messages.map((m) => m.id) } })
  assert.ok(s.room.messages.some((m) => m.id === sent.message.id), 'message absent de la synchro')
  assert.ok(Date.now() - t0 < 3000)
})

await test('Nouvel essai d’envoi : pas de doublon', async () => {
  const cid = clientId()
  const m1 = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/messages`, { text: 'Une seule fois', clientId: cid })
  const m2 = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/messages`, { text: 'Une seule fois', clientId: cid })
  assert.equal(m1.message.id, m2.message.id)
  assert.equal(m2.duplicate, true)
})

await test('20 messages simultanés depuis 4 appareils : tous conservés, même ordre pour tous', async () => {
  await sleep(5200)
  const users = [ctx.a, ctx.b, ctx.c, ctx.d]
  const sends = []
  for (let i = 0; i < 20; i++) {
    const u = users[i % 4]
    sends.push(ok(u.token, 'POST', `rooms/${ctx.rid}/messages`, { text: `rafale ${i}`, clientId: clientId() }))
  }
  const res = await Promise.allSettled(sends)
  const okIds = res.filter((r) => r.status === 'fulfilled').map((r) => r.value.message.id)
  assert.equal(okIds.length, 20, `envois en échec : ${res.filter((r) => r.status === 'rejected').map((r) => r.reason.message).join(' | ')}`)
  const views = await Promise.all(users.map((u) => ok(u.token, 'GET', `rooms/${ctx.rid}`)))
  const orders = views.map((v) => v.messages.filter((m) => okIds.includes(m.id)).map((m) => m.id))
  for (const o of orders) assert.deepEqual(o, orders[0])
  assert.equal(orders[0].length, 20)
})

await test('Anti-rafale : au-delà de 5 messages en 5 s, envoi suspendu', async () => {
  await sleep(10500)
  let limited = null
  for (let i = 0; i < 7; i++) {
    const r = await call(ctx.c.token, 'POST', `rooms/${ctx.rid}/messages`, { text: `vite ${i}`, clientId: clientId() })
    if (r.status === 429) {
      limited = r
      break
    }
  }
  assert.ok(limited, 'aucune limite appliquée')
  assert.equal(limited.data.error.code, 'slow_down')
  assert.ok(limited.data.error.retryAfterMs > 0)
})

await test('Non lus, réactions et historique paginé', async () => {
  const list = await ok(ctx.d.token, 'GET', 'rooms')
  const entry = list.rooms.find((r) => r.id === ctx.rid)
  assert.ok(entry.unread > 0, 'aucun non lu')
  const room = await ok(ctx.d.token, 'GET', `rooms/${ctx.rid}`)
  const target = room.messages.find((m) => m.type === 'text')
  const r1 = await ok(ctx.d.token, 'POST', `rooms/${ctx.rid}/reactions`, { msgId: target.id, reaction: 'coeur' })
  assert.deepEqual(r1.reactions.coeur, [ctx.d.me.id])
  const r2 = await ok(ctx.d.token, 'POST', `rooms/${ctx.rid}/reactions`, { msgId: target.id, reaction: 'rire' })
  assert.equal(r2.reactions.coeur, undefined)
  assert.deepEqual(r2.reactions.rire, [ctx.d.me.id])
  const r3 = await ok(ctx.d.token, 'POST', `rooms/${ctx.rid}/reactions`, { msgId: target.id, reaction: 'rire' })
  assert.equal(r3.reactions.rire, undefined)
  // Lecture : le curseur avance, les non lus retombent à 0.
  await ok(ctx.d.token, 'POST', 'sync', { room: { rid: ctx.rid, after: room.messages.at(-1).id, recent: room.messages.map((m) => m.id), read: room.messages.at(-1).ts } })
  await sleep(400)
  const list2 = await ok(ctx.d.token, 'GET', 'rooms')
  assert.equal(list2.rooms.find((r) => r.id === ctx.rid).unread, 0)
  // Historique : on envoie assez de messages pour dépasser une page.
  const extra = []
  for (let i = 0; i < 46; i++) {
    extra.push(ok([ctx.a, ctx.b, ctx.c, ctx.d][i % 4].token, 'POST', `rooms/${ctx.rid}/messages`, { text: `histoire ${i}`, clientId: clientId() }).catch(() => null))
    if (i % 4 === 3) await sleep(1300)
  }
  await Promise.all(extra)
  const first = await ok(ctx.a.token, 'GET', `rooms/${ctx.rid}`)
  assert.equal(first.messages.length, 50)
  assert.equal(first.hasMore, true)
  const older = await ok(ctx.a.token, 'GET', `rooms/${ctx.rid}/messages?before=${first.messages[0].id}`)
  assert.ok(older.messages.length > 0)
  assert.ok(older.messages.at(-1).id < first.messages[0].id)
})

await test('Invitation réinitialisée : l’ancien lien est expiré', async () => {
  const reset = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/invite`)
  assert.notEqual(reset.room.invite, ctx.code)
  const stranger = await newUser()
  const p = await ok(stranger.token, 'GET', `invites/${ctx.code}`)
  assert.equal(p.status, 'expired')
  const j = await call(stranger.token, 'POST', `invites/${ctx.code}/join`)
  assert.equal(j.status, 410)
  ctx.code = reset.room.invite
})

await test('Jeu factice : lobby, partie, résultats, cartes dans le fil ; une seule partie active', async () => {
  const g = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/games`, { type: 'test', settings: { rounds: 3, roundSec: 2 } })
  const gid = g.game.id
  const second = await call(ctx.b.token, 'POST', `rooms/${ctx.rid}/games`, { type: 'test' })
  assert.equal(second.status, 409)
  await ok(ctx.b.token, 'POST', `games/${gid}/join`)
  await ok(ctx.a.token, 'POST', 'sync', { game: { gid, beat: true } })
  await ok(ctx.b.token, 'POST', 'sync', { game: { gid, beat: true } })
  await ok(ctx.a.token, 'POST', `games/${gid}/start`)
  let state = null
  for (let i = 0; i < 20; i++) {
    await ok(ctx.b.token, 'POST', `games/${gid}/act`, { type: 'tap' }).catch(() => null)
    const sa = await ok(ctx.a.token, 'POST', 'sync', { game: { gid, beat: true } })
    await ok(ctx.b.token, 'POST', 'sync', { game: { gid, beat: true } })
    state = sa.game.game
    if (state.status === 'finished' && state.rewardsDone) break
    await sleep(700)
  }
  assert.equal(state.status, 'finished')
  assert.equal(state.results.ranking[0].uid, ctx.b.me.id)
  const room = await ok(ctx.a.token, 'GET', `rooms/${ctx.rid}`)
  const cards = room.messages.filter((m) => m.type === 'game' && m.gid === gid)
  assert.ok(cards.some((m) => m.kind === 'invite'))
  assert.ok(cards.some((m) => m.kind === 'results'))
  assert.equal(room.room.game, null)
})

function leaks(obj, word) {
  return JSON.stringify(obj).toLowerCase().includes(word.toLowerCase())
}

await test('Draw It : partie complète à 3, mot secret jamais envoyé aux devineurs', async () => {
  const players = [ctx.a, ctx.b, ctx.c]
  const g = await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/games`, { type: 'drawit', settings: { tours: 1, drawTime: 45 } })
  const gid = g.game.id
  ctx.gid = gid
  for (const u of [ctx.b, ctx.c]) await ok(u.token, 'POST', `games/${gid}/join`)
  for (const u of players) await ok(u.token, 'POST', 'sync', { game: { gid, beat: true } })
  await ok(ctx.a.token, 'POST', `games/${gid}/start`)
  const byId = Object.fromEntries(players.map((u) => [u.me.id, u]))
  const seenWords = []
  let customDone = false
  let rounds = 0
  for (let guard = 0; guard < 120; guard++) {
    const views = await Promise.all(players.map((u) => ok(u.token, 'POST', 'sync', { game: { gid, beat: true, full: guard % 3 === 0 } })))
    const view = views[0].game.game
    if (view.status === 'finished' && view.rewardsDone) break
    const gs = view.g
    if (view.status === 'playing' && gs.phase === 'choosing') {
      const drawer = byId[gs.drawerId]
      const dv = views[players.indexOf(drawer)].game.game.g
      assert.equal(dv.choices.length, 3)
      if (!customDone && dv.canCustom) {
        await ok(drawer.token, 'POST', `games/${gid}/act`, { type: 'custom', word: 'Arc-en-ciel', round: gs.round })
        customDone = true
      } else {
        await ok(drawer.token, 'POST', `games/${gid}/act`, { type: 'choose', index: 1, round: gs.round })
      }
      continue
    }
    if (view.status === 'playing' && gs.phase === 'drawing') {
      const drawer = byId[gs.drawerId]
      const dv = views[players.indexOf(drawer)].game.game.g
      const word = dv.word
      assert.ok(word, 'le dessinateur doit voir son mot')
      seenWords.push(word)
      await ok(drawer.token, 'POST', `games/${gid}/strokes`, { round: gs.round, seq: 0, ops: [{ k: 'p', i: 0, c: 0, w: 1, p: [10, 10, 200, 150, 400, 300] }] })
      for (const u of players) {
        if (u === drawer) continue
        const gv = views[players.indexOf(u)]
        assert.ok(!leaks(gv, word), `le mot « ${word} » a fuité vers un devineur`)
        // Une proposition fausse puis la bonne (majuscules et accents différents).
        const wrong = await ok(u.token, 'POST', `games/${gid}/act`, { type: 'guess', text: 'zzzz', round: gs.round })
        assert.equal(wrong.result, 'wrong')
        await sleep(1050)
        const answer = word === 'Arc-en-ciel' ? 'arc en ciel' : word.toUpperCase()
        const right = await ok(u.token, 'POST', `games/${gid}/act`, { type: 'guess', text: answer, round: gs.round })
        assert.equal(right.result, 'correct')
        const again = await call(u.token, 'POST', `games/${gid}/act`, { type: 'guess', text: 'encore', round: gs.round })
        assert.equal(again.status, 409)
      }
      // Les autres ne voient que « a trouvé », jamais le texte de la bonne réponse.
      const after = await ok(ctx.a.token, 'POST', 'sync', { game: { gid, beat: true } })
      const guesses = after.game.guesses || []
      assert.ok(guesses.some((x) => x.k === 'f'))
      assert.ok(!guesses.some((x) => x.k === 'w' && x.text.toLowerCase() === word.toLowerCase()))
      rounds++
      continue
    }
    await sleep(900)
  }
  const final = await ok(ctx.a.token, 'GET', `games/${gid}`)
  assert.equal(final.game.status, 'finished')
  assert.equal(rounds, 3)
  assert.equal(final.game.results.played, 3)
  assert.equal(final.game.results.valid, true)
  for (const r of final.game.g.rounds) assert.equal(r.reason, 'found')
  assert.ok(final.game.rewardsDone)
  for (const u of players) assert.ok(final.game.rewards[u.me.id].xp > 0)
  ctx.firstXp = Object.fromEntries(players.map((u) => [u.me.id, final.game.rewards[u.me.id].xp]))
})

await test('XP, niveau, badge « Première patte » et classement du salon', async () => {
  const me = await ok(ctx.b.token, 'GET', 'me')
  assert.ok(me.me.xp >= ctx.firstXp[ctx.b.me.id])
  assert.ok(me.me.badges.premiere_patte)
  assert.equal(me.me.streak, 1)
  const lb = await ok(ctx.b.token, 'GET', `rooms/${ctx.rid}/leaderboard?scope=week`)
  assert.ok(lb.entries.length >= 3)
  const all = await ok(ctx.b.token, 'GET', `rooms/${ctx.rid}/leaderboard?scope=all`)
  assert.deepEqual(all.entries.map((e) => e.xp), lb.entries.map((e) => e.xp))
  // Relancer la synchro d'une partie terminée ne réattribue pas l'XP.
  await ok(ctx.b.token, 'POST', 'sync', { game: { gid: ctx.gid, full: true } })
  const me2 = await ok(ctx.b.token, 'GET', 'me')
  assert.equal(me2.me.xp, me.me.xp)
})

await test('Rejouer : nouveau lobby avec les mêmes joueurs et réglages', async () => {
  const r = await ok(ctx.b.token, 'POST', `rooms/${ctx.rid}/games`, { type: 'drawit', from: ctx.gid })
  const ids = r.game.players.map((p) => p.id).sort()
  assert.deepEqual(ids, [ctx.a.me.id, ctx.b.me.id, ctx.c.me.id].sort())
  assert.equal(r.game.settings.drawTime, 45)
  const same = await ok(ctx.c.token, 'POST', `rooms/${ctx.rid}/games`, { type: 'drawit', from: ctx.gid })
  assert.equal(same.game.id, r.game.id)
  const left = await ok(ctx.b.token, 'POST', `games/${r.game.id}/leave`)
  assert.ok(left.game)
  ctx.replayId = r.game.id
})

await test('Hôte du salon : renommer, retirer un membre ; départ de l’hôte', async () => {
  const ren = await ok(ctx.a.token, 'PATCH', `rooms/${ctx.rid}`, { name: 'La meute' })
  assert.equal(ren.room.name, 'La meute')
  const notHost = await call(ctx.b.token, 'PATCH', `rooms/${ctx.rid}`, { name: 'Pirates' })
  assert.ok(notHost.status >= 400)
  assert.equal(notHost.data.error.code, 'not_host')
  await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/kick`, { uid: ctx.d.me.id })
  const s = await ok(ctx.d.token, 'POST', 'sync', { room: { rid: ctx.rid } })
  assert.equal(s.room.removed, true)
  await ok(ctx.a.token, 'POST', `rooms/${ctx.rid}/leave`)
  const room = await ok(ctx.b.token, 'GET', `rooms/${ctx.rid}`)
  assert.equal(room.room.hostId, ctx.b.me.id)
})

// ---------- v2 : plusieurs groupes, photos, téléphone + PC, jeux en direct et dans la conversation ----------

function crc32(buf) {
  let crc = ~0
  for (const b of buf) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** Petite image PNG valide (dégradé), sans dépendance. */
function pngDataUrl(w = 24, h = 24) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      raw[i] = (x * 10) & 255
      raw[i + 1] = (y * 10) & 255
      raw[i + 2] = 160
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${bytes.toString('base64')}`
}

await test('Plusieurs groupes : créer, rejoindre, liste par compte, limite de 50', async () => {
  ctx.p = await newUser()
  ctx.q = await newUser()
  ctx.r = await newUser()
  const g2 = await ok(ctx.p.token, 'POST', 'rooms', { name: 'Famille' })
  const g3 = await ok(ctx.p.token, 'POST', 'rooms', { name: 'Bureau' })
  const g4 = await ok(ctx.q.token, 'POST', 'rooms', { name: 'Club de foot' })
  ctx.g2 = g2.room.id
  for (const u of [ctx.q, ctx.r]) await ok(u.token, 'POST', `invites/${g2.room.invite}/join`)
  await ok(ctx.p.token, 'POST', `invites/${g4.room.invite}/join`)
  await ok(ctx.p.token, 'POST', `rooms/${g3.room.id}/messages`, { text: 'Réunion à 10 h', clientId: clientId() })
  const listP = await ok(ctx.p.token, 'GET', 'rooms')
  assert.deepEqual(listP.rooms.map((r) => r.name).sort(), ['Bureau', 'Club de foot', 'Famille'])
  const bureau = listP.rooms.find((r) => r.name === 'Bureau')
  assert.equal(bureau.last.type, 'text')
  assert.equal(bureau.last.text, 'Réunion à 10 h')
  const listQ = await ok(ctx.q.token, 'GET', 'rooms')
  assert.deepEqual(listQ.rooms.map((r) => r.name).sort(), ['Club de foot', 'Famille'])
  // Limite : 50 groupes par compte.
  const many = await newUser()
  for (let i = 0; i < 50; i++) await ok(many.token, 'POST', 'rooms', { name: `Groupe ${i + 1}` })
  const over = await call(many.token, 'POST', 'rooms', { name: 'Un de trop' })
  assert.equal(over.status, 409)
  assert.equal(over.data.error.code, 'too_many_groups')
  const overJoin = await call(many.token, 'POST', `invites/${g2.room.invite}/join`)
  assert.equal(overJoin.data.error.code, 'too_many_groups')
})

await test('Photo de profil : visible des membres du groupe par lien signé, retrait', async () => {
  const up = await ok(ctx.p.token, 'POST', 'me/photo', { image: pngDataUrl() })
  assert.match(up.me.photoUrl, /^\/api\/photos\/SHX-[A-Z0-9]{6}\/\w+\?e=\d+&s=[\w-]+$/)
  const room = await ok(ctx.q.token, 'GET', `rooms/${ctx.g2}`)
  const pm = room.members.find((m) => m.id === ctx.p.me.id)
  assert.ok(pm.photoUrl, 'les membres reçoivent l’adresse de la photo')
  const img = await fetch(`${BASE}${pm.photoUrl}`)
  assert.equal(img.status, 200)
  assert.match(img.headers.get('content-type'), /^image\//)
  assert.ok((await img.arrayBuffer()).byteLength > 50)
  const forged = await fetch(`${BASE}${pm.photoUrl.replace(/s=[\w-]+$/, 's=AAAAAAAAAAAAAAAAAAAAAA')}`)
  assert.ok([403, 409].includes(forged.status), `signature refusée (${forged.status})`) // 409 : équivalent local de 403
  const outsider = await newUser()
  const denied = await call(outsider.token, 'GET', `rooms/${ctx.g2}`)
  assert.equal(denied.status >= 400 && denied.status < 500, true, 'un non-membre ne voit pas le groupe (ni les photos)')
  const bad = await call(ctx.p.token, 'POST', 'me/photo', { image: 'data:text/plain;base64,SGVsbG8=' })
  assert.equal(bad.status, 400)
  const removed = await ok(ctx.q.token, 'POST', 'me/photo', { image: pngDataUrl(30, 30) })
  assert.ok(removed.me.photoUrl)
  const gone = await ok(ctx.q.token, 'POST', 'me/photo/remove')
  assert.equal(gone.me.photoUrl, null)
})

await test('Téléphone + PC : même compte, appareils listés, réglages et messages synchronisés', async () => {
  const link = await ok(ctx.p.token, 'POST', 'me/link')
  const phone = await ok(null, 'POST', 'link/redeem', { token: link.token })
  const before = await ok(ctx.p.token, 'POST', 'sync', { rooms: true })
  const meBefore = await ok(ctx.p.token, 'GET', 'me')
  assert.ok(meBefore.me.devices.length >= 2, 'deux appareils listés')
  assert.equal(meBefore.me.devices.filter((d) => d.current).length, 1)
  await ok(phone.token, 'PATCH', 'me', { settings: { lang: 'en' } })
  await sleep(5200) // cache de compte par instance (5 s)
  const after = await ok(ctx.p.token, 'POST', 'sync', { rooms: true })
  assert.notEqual(after.meRev, before.meRev, 'le PC apprend que le profil a changé')
  const meAfter = await ok(ctx.p.token, 'GET', 'me')
  assert.equal(meAfter.me.settings.lang, 'en')
  const room = await ok(ctx.p.token, 'GET', `rooms/${ctx.g2}`)
  const sent = await ok(phone.token, 'POST', `rooms/${ctx.g2}/messages`, { text: 'Envoyé du téléphone', clientId: clientId() })
  const s = await ok(ctx.p.token, 'POST', 'sync', { room: { rid: ctx.g2, after: room.messages.at(-1)?.id, recent: room.messages.map((m) => m.id) } })
  assert.ok(s.room.messages.some((m) => m.id === sent.message.id))
  await ok(phone.token, 'PATCH', 'me', { settings: { lang: 'fr' } })
})

await test('Morpion dans la conversation : carte, coups, suivi par l’interrogation, victoire et XP', async () => {
  const xpBefore = (await ok(ctx.p.token, 'GET', 'me')).me.xp
  const created = await ok(ctx.p.token, 'POST', `rooms/${ctx.g2}/async`, { type: 'morpion', options: { opponent: ctx.q.me.id } })
  const id = created.game.id
  assert.equal(created.game.status, 'open')
  assert.equal(created.game.data.myTurn, true)
  const sq = await ok(ctx.q.token, 'POST', 'sync', { room: { rid: ctx.g2, av: {} } })
  const seen = sq.room.async.games.find((g) => g.id === id)
  assert.ok(seen, 'l’adversaire reçoit le jeu par l’interrogation')
  assert.equal(seen.data.myTurn, false)
  assert.ok(sq.room.messages.some((m) => m.type === 'game' && m.kind === 'async' && m.agid === id), 'carte dans le fil')
  const turn = await call(ctx.q.token, 'POST', `async/${id}/act`, { type: 'move', cell: 4 })
  assert.equal(turn.data.error.code, 'not_your_turn')
  const spectator = await call(ctx.r.token, 'POST', `async/${id}/act`, { type: 'move', cell: 4 })
  assert.equal(spectator.status, 409)
  const moves = [[ctx.p, 0], [ctx.q, 3], [ctx.p, 1], [ctx.q, 4]]
  for (const [u, cell] of moves) await ok(u.token, 'POST', `async/${id}/act`, { type: 'move', cell })
  const known = { [id]: (await ok(ctx.q.token, 'GET', `async/${id}`)).game.v }
  const quiet = await ok(ctx.q.token, 'POST', 'sync', { room: { rid: ctx.g2, av: known } })
  assert.ok(!quiet.room.async.games.some((g) => g.id === id), 'pas de renvoi d’un jeu inchangé')
  const win = await ok(ctx.p.token, 'POST', `async/${id}/act`, { type: 'move', cell: 2 })
  assert.equal(win.game.status, 'finished')
  assert.deepEqual(win.game.result.winners, [ctx.p.me.id])
  const changed = await ok(ctx.q.token, 'POST', 'sync', { room: { rid: ctx.g2, av: known } })
  assert.equal(changed.room.async.games.find((g) => g.id === id)?.status, 'finished')
  const room = await ok(ctx.r.token, 'GET', `rooms/${ctx.g2}`)
  const sys = room.messages.find((m) => m.type === 'sys' && m.sys?.kind === 'asyncResult' && m.sys.gtype === 'morpion')
  assert.ok(sys, 'message de résultat dans le fil')
  assert.equal(sys.sys.winner, ctx.p.me.pseudo)
  const xpAfter = (await ok(ctx.p.token, 'GET', 'me')).me.xp
  assert.ok(xpAfter > xpBefore, 'le gagnant gagne de l’XP')
  const outsider = await newUser()
  const denied = await call(outsider.token, 'GET', `async/${id}`)
  assert.ok(denied.status >= 400)
})

await test('Devine mon dessin : image publiée, mot caché, fin quand tout le monde a trouvé', async () => {
  const created = await ok(ctx.p.token, 'POST', `rooms/${ctx.g2}/async`, { type: 'dessin', options: { word: 'pomme' }, image: pngDataUrl(40, 30) })
  const id = created.game.id
  const img = await fetch(`${BASE}/api/async/${id}/image`)
  assert.equal(img.status, 200)
  const forQ = await ok(ctx.q.token, 'GET', `async/${id}`)
  assert.equal(forQ.game.data.word, null)
  assert.ok(!leaks(forQ, 'pomme'), 'le mot n’est jamais envoyé aux devineurs')
  const wrong = await ok(ctx.q.token, 'POST', `async/${id}/act`, { type: 'guess', text: 'poire' })
  assert.notEqual(wrong.outcome.result, 'correct')
  const okQ = await ok(ctx.q.token, 'POST', `async/${id}/act`, { type: 'guess', text: 'Pomme' })
  assert.equal(okQ.outcome.result, 'correct')
  assert.equal(okQ.game.data.word, 'pomme')
  const okR = await ok(ctx.r.token, 'POST', `async/${id}/act`, { type: 'guess', text: 'pomme' })
  assert.equal(okR.game.status, 'finished')
  const noImage = await call(ctx.p.token, 'POST', `rooms/${ctx.g2}/async`, { type: 'dessin', options: { word: 'chat' } })
  assert.equal(noImage.data.error.code, 'image')
})

await test('Quiz en direct : question sans la réponse, fin de manche dès que tous ont répondu', async () => {
  const g = await ok(ctx.p.token, 'POST', `rooms/${ctx.g2}/games`, { type: 'quiz' })
  const gid = g.game.id
  await ok(ctx.q.token, 'POST', `games/${gid}/join`)
  for (const u of [ctx.p, ctx.q]) await ok(u.token, 'POST', 'sync', { game: { gid, beat: true } })
  await ok(ctx.p.token, 'POST', `games/${gid}/settings`, { settings: { rounds: 5, lang: 'en' } })
  await ok(ctx.p.token, 'POST', `games/${gid}/start`)
  const v1 = (await ok(ctx.q.token, 'GET', `games/${gid}`)).game
  assert.equal(v1.status, 'playing')
  assert.equal(v1.g.phase, 'question')
  assert.equal(v1.g.prompt.choices.length, 4)
  assert.equal(v1.g.reveal, undefined)
  assert.ok(!JSON.stringify(v1).includes('"correct"'), 'la bonne réponse n’est pas envoyée pendant la question')
  const a1 = await ok(ctx.p.token, 'POST', `games/${gid}/act`, { type: 'answer', round: 0, value: 0 })
  assert.equal(a1.result, 'answered')
  const twice = await call(ctx.p.token, 'POST', `games/${gid}/act`, { type: 'answer', round: 0, value: 1 })
  assert.equal(twice.data.error.code, 'already_answered')
  await ok(ctx.q.token, 'POST', `games/${gid}/act`, { type: 'answer', round: 0, value: 1 })
  let view = null
  for (let i = 0; i < 10; i++) {
    view = (await ok(ctx.p.token, 'POST', 'sync', { game: { gid, beat: true, full: true } })).game.game
    if (view.g.phase === 'reveal') break
    await sleep(300)
  }
  assert.equal(view.g.phase, 'reveal')
  assert.ok([0, 1, 2, 3].includes(view.g.reveal.secret.correct))
  assert.equal(Object.keys(view.g.reveal.detail).length, 2)
  const total = view.players.reduce((s, p) => s + p.score, 0)
  if ([0, 1].includes(view.g.reveal.secret.correct)) assert.ok(total >= 50 && total <= 100, 'une seule des deux réponses est bonne')
  else assert.equal(total, 0)
  for (const u of [ctx.p, ctx.q]) await ok(u.token, 'POST', `games/${gid}/leave`)
})

console.log(`\n${passed}/${results.length} tests réussis`)
