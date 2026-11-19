// Parcours type complet sur 3 appareils (PC, téléphone, tablette), sans rechargement :
// création du salon, invitation par lien, chat, lobby, partie de Draw It, résultats.
// Lancer : netlify dev, puis `npm run test:e2e` (Playwright doit être installé : npx playwright install chromium).
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
function loadPlaywright() {
  for (const base of [import.meta.url, 'file:///opt/node-tools/']) {
    try {
      return createRequire(base)('playwright')
    } catch {
      /* essai suivant */
    }
  }
  throw new Error('Playwright introuvable : npm i -D playwright && npx playwright install chromium')
}
const { chromium, devices } = loadPlaywright()
void require

const BASE = process.env.SHX_BASE || 'http://localhost:8888'
const SHOTS = process.env.SHX_SHOTS || null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}]`, ...a)

const browser = await chromium.launch()
setTimeout(() => {
  console.error('✘ délai global dépassé (240 s)')
  process.exit(1)
}, 240000).unref()
const errors = []
async function device(name, options) {
  const ctx = await browser.newContext({ ...options, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
  page.label = name
  return page
}
const shot = async (page, file) => SHOTS && page.screenshot({ path: `${SHOTS}/${file}.png` })

const pc = await device('PC', { viewport: { width: 1440, height: 900 } })
const phone = await device('Téléphone', devices['Pixel 7'])
const tablet = await device('Tablette', { viewport: { width: 900, height: 1180 }, hasTouch: true })
const all = [pc, phone, tablet]

try {
  // 1. Première visite : compte créé sans saisie, pseudo et shiba affichés.
  await pc.goto(BASE)
  await pc.getByRole('button', { name: /C’est parti/ }).waitFor()
  await shot(pc, 'e2e-01-welcome-pc')
  await pc.getByRole('button', { name: /C’est parti/ }).click()
  await pc.getByRole('button', { name: 'Créer un groupe' }).first().click()
  await pc.getByLabel('Nom du groupe').fill('La meute E2E')
  await pc.getByRole('button', { name: 'Créer le groupe' }).click()
  const sheet = pc.getByRole('dialog', { name: 'Groupe créé ! Invite tes amis' })
  await sheet.waitFor({ timeout: 10000 })
  const code = (await sheet.locator('.invite-code').textContent()).trim()
  log('salon créé, code', code)
  await sheet.getByRole('button', { name: 'Fermer' }).click()
  await sheet.waitFor({ state: 'detached' })

  // 2. Les amis ouvrent le lien d'invitation : bienvenue, « C'est parti », arrivée directe dans le salon.
  for (const p of [phone, tablet]) {
    await p.goto(`${BASE}/#/rejoindre/${code}`)
    await p.getByText('Tu es invité dans le groupe « La meute E2E »').waitFor({ timeout: 15000 })
    if (p === phone) await shot(p, 'e2e-02-welcome-invite-phone')
    await p.getByRole('button', { name: /C’est parti/ }).click()
    await p.locator('.room-screen h1', { hasText: 'La meute E2E' }).waitFor({ timeout: 15000 })
  }
  log('les 3 appareils sont dans le salon')

  // 3. Chat : un message arrive chez les autres en moins de 3 s.
  const t0 = Date.now()
  await pc.getByLabel('Écrire un message').fill('Salut la meute ! On fait un Draw It ?')
  await pc.keyboard.press('Enter')
  await phone.locator('.bubble', { hasText: 'Salut la meute !' }).waitFor({ timeout: 6000 })
  const chatLatency = Date.now() - t0
  log(`message reçu sur le téléphone en ${chatLatency} ms`)
  await phone.getByLabel('Écrire un message').fill('Grave ! 🐶')
  await phone.getByRole('button', { name: 'Envoyer' }).click()
  await pc.locator('.bubble', { hasText: 'Grave !' }).waitFor({ timeout: 6000 })
  await shot(pc, 'e2e-03-room-pc')

  // 4. Hub puis lobby ; une carte d'invitation apparaît dans le fil.
  await pc.getByRole('button', { name: 'Jouer' }).click()
  await pc.getByRole('button', { name: 'Lancer Draw It' }).click()
  await pc.getByText('Draw It · Lobby').waitFor()
  const oneTour = pc.getByRole('group', { name: 'Tours', exact: true }).getByRole('button', { name: '1', exact: true })
  const fast = pc.getByRole('group', { name: 'Temps de dessin' }).getByRole('button', { name: '45 s' })
  await oneTour.click()
  await fast.click()
  await pc.waitForFunction(() => {
    const q = (label, name) => [...document.querySelectorAll(`[aria-label="${label}"] button`)].find((b) => b.textContent.trim() === name)
    return q('Tours', '1')?.getAttribute('aria-pressed') === 'true' && q('Temps de dessin', '45 s')?.getAttribute('aria-pressed') === 'true'
  }, null, { timeout: 8000 })
  for (const p of [phone, tablet]) {
    const join = p.locator('.game-card').getByRole('button', { name: 'Rejoindre' })
    await join.waitFor({ timeout: 10000 })
    await join.click()
    await p.getByText('Draw It · Lobby').waitFor()
  }
  await pc.getByText('Joueurs (3/8)').waitFor({ timeout: 10000 })
  await shot(pc, 'e2e-04-lobby-pc')
  await pc.getByRole('button', { name: 'Lancer la partie' }).click()
  log('partie lancée')

  // 5. Manches : le dessinateur choisit, dessine ; les autres voient le dessin et devinent.
  const latencies = []
  const words = []
  for (let round = 0; round < 3; round++) {
    let drawer = null
    for (let i = 0; i < 60 && !drawer; i++) {
      for (const p of all) if (await p.getByText('À toi de dessiner !').isVisible({ timeout: 1000 }).catch(() => false)) drawer = p
      if (!drawer) await sleep(500)
    }
    assert.ok(drawer, `manche ${round + 1} : aucun dessinateur`)
    const guessers = all.filter((p) => p !== drawer)
    await drawer.locator('.word-choice').nth(round === 1 ? 1 : 0).click()
    await drawer.locator('.secret-word').waitFor({ timeout: 8000 })
    const word = (await drawer.locator('.secret-word').textContent()).trim()
    words.push(word)
    log(`manche ${round + 1} : ${drawer.label} dessine « ${word} »`)

    // Le mot secret n'apparaît pas chez les devineurs avant la fin de la manche.
    for (const g of guessers) {
      await g.locator('#guess').waitFor({ timeout: 8000 })
      const text = (await g.locator('body').innerText()).toLowerCase()
      assert.ok(!text.includes(word.toLowerCase()), `le mot a fuité chez ${g.label}`)
    }

    // Trait au doigt / à la souris, puis mesure du délai d'affichage chez un devineur.
    const box = await drawer.locator('.canvas-wrap canvas').boundingBox()
    const start = Date.now()
    await drawer.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
    await drawer.mouse.down()
    for (let k = 1; k <= 12; k++) await drawer.mouse.move(box.x + box.width * (0.2 + k * 0.05), box.y + box.height * (0.3 + Math.sin(k / 2) * 0.2), { steps: 2 })
    await drawer.mouse.up()
    const watcher = guessers[0]
    let seen = null
    for (let i = 0; i < 80 && !seen; i++) {
      const inked = await watcher
        .locator('.canvas-wrap canvas')
        .evaluate((c) => {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          for (let j = 0; j < d.length; j += 16) if (d[j] < 200) return true
          return false
        }, null, { timeout: 2000 })
        .catch(() => false)
      if (inked) seen = Date.now() - start
      else await sleep(50)
    }
    assert.ok(seen, 'le dessin n’est jamais apparu chez le devineur')
    latencies.push(seen)
    log(`  dessin visible chez ${watcher.label} après ${seen} ms`)
    if (round === 0) await Promise.all([shot(drawer, 'e2e-05-drawer'), shot(phone === drawer ? tablet : phone, 'e2e-06-guesser')])

    // Propositions : une fausse, puis la bonne (majuscules / sans accents).
    for (const [i, g] of guessers.entries()) {
      await g.locator('#guess').fill('pas ça')
      await g.locator('#guess').press('Enter')
      await sleep(1100)
      const answer = i === 0 ? word.toUpperCase() : word.normalize('NFD').replace(/\p{M}/gu, '')
      await g.locator('#guess').fill(answer)
      await g.locator('#guess').press('Enter')
      // « Tu as trouvé ! », ou directement la révélation si tout le monde a trouvé.
      await g.getByText('Tu as trouvé !').or(g.getByText('Le mot était')).first().waitFor({ timeout: 6000 })
    }
    await drawer.getByText('Tout le monde a trouvé').waitFor({ timeout: 8000 })
    if (round === 0) await shot(drawer, 'e2e-07-reveal')
  }

  // 6. Résultats : podium, XP, carte de résultats dans le salon, « Rejouer ».
  for (const p of all) await p.getByText('Fin de la partie !').waitFor({ timeout: 25000 })
  for (const p of all) await p.getByText(/Ton XP : \+\d+/).waitFor({ timeout: 15000 })
  await sleep(2500)
  for (const p of all) await p.keyboard.press('Escape').catch(() => {})
  // Ferme les célébrations (badges, passage de niveau) et le rappel de la clé.
  async function dismissAll(p) {
    let quiet = 0
    for (let i = 0; i < 30 && quiet < 3; i++) {
      const celeb = p.locator('.celebration button').first()
      const later = p.locator('.sheet button:has-text("Plus tard")').first()
      const btn = (await celeb.isVisible().catch(() => false)) ? celeb : later
      if (await btn.isVisible().catch(() => false)) {
        if (p === phone && !(await p.evaluate(() => window.__shotBadge))) {
          await shot(p, 'e2e-08b-badge-phone')
          await p.evaluate(() => (window.__shotBadge = true))
        }
        await btn.click({ timeout: 3000 }).catch(() => {})
        quiet = 0
      } else quiet++
      await sleep(400)
    }
  }
  await sleep(1200)
  await Promise.all(all.map(dismissAll))
  await shot(phone, 'e2e-08-results-phone')
  await shot(pc, 'e2e-09-results-pc')
  await pc.locator('.results-actions').getByRole('button', { name: 'Retour au groupe' }).click()
  await pc.locator('.game-card.results').waitFor({ timeout: 10000 })
  await sleep(1500)
  await shot(pc, 'e2e-10-room-results-card')
  log('mots joués :', words.join(', '))
  log('délais d’affichage du dessin (ms) :', latencies.join(', '))
  assert.ok(chatLatency < 3000, `message reçu en ${chatLatency} ms (> 3 s)`)
  assert.ok(Math.max(...latencies) < 1500, `dessin affiché en ${Math.max(...latencies)} ms (> 1,5 s)`)
  if (errors.length) throw new Error(`Erreurs navigateur :\n${errors.join('\n')}`)
  console.log('\n✔ Parcours type validé sur 3 appareils')
} catch (err) {
  for (const p of all) await shot(p, `e2e-fail-${p.label}`).catch(() => {})
  console.error('✘', err)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
