// Tests d'intégration de l'API contre `netlify dev` (http://localhost:8888 par défaut).
// Lancer : netlify dev (avec SHX_ENABLE_TEST_GAME=1), puis `npm run test:api`.
import assert from 'node:assert/strict'

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

console.log(`\n${passed}/${results.length} tests réussis`)
