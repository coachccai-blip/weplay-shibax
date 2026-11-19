// Parcours v2 sur 2 appareils, sans rechargement : interface en anglais (PC) et en français (téléphone),
// photo de profil vue par l'autre membre, morpion dans la conversation, quiz en direct.
// Lancer : netlify dev (SHX_ENABLE_TEST_GAME=1), puis `node tests/e2e/v2.e2e.mjs`.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

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

const BASE = process.env.SHX_BASE || 'http://localhost:8888'
const SHOTS = process.env.SHX_SHOTS || null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[v2 ${new Date().toISOString().slice(11, 19)}]`, ...a)

// Photo de test : PNG 200 × 200 (dégradé), écrite dans un dossier temporaire.
function crc32(buf) {
  let crc = ~0
  for (const b of buf) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function writePng(file, w = 200, h = 200) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      const d = Math.hypot(x - w / 2, y - h / 2) < w / 3
      raw[i] = d ? 245 : 120
      raw[i + 1] = d ? 160 : 190
      raw[i + 2] = d ? 60 : 230
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
const photoFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shx-')), 'photo.png')
writePng(photoFile)

const browser = await chromium.launch()
setTimeout(() => {
  console.error('✘ délai global dépassé (200 s)')
  process.exit(1)
}, 200000).unref()
const errors = []
async function device(name, options, locale) {
  const ctx = await browser.newContext({ ...options, locale, timezoneId: 'Europe/Paris' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
  page.label = name
  return page
}
const shot = async (page, file) => SHOTS && page.screenshot({ path: `${SHOTS}/${file}.png` })

const pc = await device('PC (EN)', { viewport: { width: 1440, height: 900 } }, 'en-GB')
const phone = await device('Téléphone (FR)', devices['Pixel 7'], 'fr-FR')

try {
  // 1. PC en anglais : bienvenue, groupe créé.
  await pc.goto(BASE)
  await pc.getByText('Welcome to the pack!').waitFor({ timeout: 15000 })
  await shot(pc, 'v2-01-welcome-en')
  await pc.getByRole('button', { name: /Let’s go/ }).click()
  await pc.getByRole('button', { name: 'Create a group' }).first().click()
  await pc.getByLabel('Group name').fill('Pack v2')
  await pc.getByRole('button', { name: 'Create the group' }).click()
  const sheet = pc.getByRole('dialog', { name: 'Group created! Invite your friends' })
  await sheet.waitFor({ timeout: 10000 })
  const code = (await sheet.locator('.invite-code').textContent()).trim()
  await sheet.getByRole('button', { name: 'Close' }).click()
  log('groupe créé (interface anglaise), code', code)

  // 2. Téléphone en français : rejoint le groupe, ajoute une photo.
  await phone.goto(`${BASE}/#/rejoindre/${code}`)
  await phone.getByText('Tu es invité dans le groupe « Pack v2 »').waitFor({ timeout: 15000 })
  await phone.getByRole('button', { name: /C’est parti/ }).click()
  await phone.locator('.room-screen h1', { hasText: 'Pack v2' }).waitFor({ timeout: 15000 })
  await phone.goto(`${BASE}/#/profil`)
  await phone.getByRole('heading', { name: 'Ma photo' }).waitFor()
  await phone.locator('input[type="file"]').setInputFiles(photoFile)
  await phone.getByRole('dialog', { name: 'Recadrer ma photo' }).waitFor()
  await shot(phone, 'v2-02-photo-crop')
  await phone.getByRole('button', { name: 'Enregistrer' }).click()
  await phone.getByText('Photo enregistrée !').waitFor({ timeout: 10000 })
  await shot(phone, 'v2-03-profile-photo')
  log('photo enregistrée sur le téléphone')
  await phone.goto(`${BASE}/#/`)
  await phone.locator('.room-item', { hasText: 'Pack v2' }).click()
  await phone.getByLabel('Écrire un message').fill('Coucou avec ma photo !')
  await phone.getByRole('button', { name: 'Envoyer' }).click()
  await pc.locator('.bubble', { hasText: 'Coucou avec ma photo' }).waitFor({ timeout: 8000 })
  await pc.locator('.avatar-photo img').first().waitFor({ timeout: 8000 })
  const photoOk = await pc.locator('.avatar-photo img').first().evaluate((img) => img.complete && img.naturalWidth > 0)
  assert.ok(photoOk, 'la photo du téléphone s’affiche sur le PC')
  log('photo visible par l’autre membre')

  // 3. Morpion dans la conversation, lancé depuis le hub (PC), joué par les deux.
  await pc.getByRole('button', { name: 'Play' }).click()
  await pc.getByRole('tab', { name: /Live/ }).waitFor()
  await shot(pc, 'v2-04a-hub-live-en')
  await pc.getByRole('tab', { name: /Async/ }).click()
  await pc.getByRole('heading', { name: 'In progress in this group' }).waitFor()
  await shot(pc, 'v2-04-hub-en')
  await pc.getByRole('button', { name: 'Start Tic-tac-toe' }).click()
  const setup = pc.getByRole('dialog', { name: /Tic-tac-toe/ })
  await setup.waitFor()
  await setup.locator('.pick-item').nth(1).click()
  await setup.getByRole('button', { name: 'Send the challenge' }).click()
  await pc.locator('.ag-card.ag-morpion').waitFor({ timeout: 10000 })
  await phone.locator('.ag-card.ag-morpion').waitFor({ timeout: 10000 })
  const pcCard = pc.locator('.ag-card.ag-morpion').last()
  const phoneCard = phone.locator('.ag-card.ag-morpion').last()
  const move = async (page, card, n) => {
    await card.getByRole('button', { name: page === pc ? `Square ${n}` : `Case ${n}`, exact: true }).click()
  }
  const waitMark = async (card, n, mark) => card.locator('.ttt-cell').nth(n - 1).filter({ hasText: mark }).waitFor({ timeout: 8000 })
  const t0 = Date.now()
  await move(pc, pcCard, 1)
  await waitMark(phoneCard, 1, '✕')
  log(`coup du PC visible sur le téléphone en ${Date.now() - t0} ms`)
  await shot(phone, 'v2-05-morpion-phone')
  await move(phone, phoneCard, 4)
  await waitMark(pcCard, 4, '◯')
  await move(pc, pcCard, 2)
  await waitMark(phoneCard, 2, '✕')
  await move(phone, phoneCard, 5)
  await waitMark(pcCard, 5, '◯')
  await move(pc, pcCard, 3)
  await pcCard.getByText('You won!').waitFor({ timeout: 8000 })
  await phone.locator('.sys-msg', { hasText: '« Morpion »' }).waitFor({ timeout: 10000 })
  await pc.locator('.sys-msg', { hasText: '“Tic-tac-toe”' }).waitFor({ timeout: 10000 })
  await shot(pc, 'v2-06-morpion-won-pc')
  log('morpion gagné ; résultat affiché dans chaque langue')
  // Revanche : nouvelle carte « Partie 2 », c'est au téléphone de commencer.
  await phoneCard.getByRole('button', { name: 'Revanche' }).click()
  await phone.locator('.ag-card.ag-morpion', { hasText: 'Partie 2' }).getByText('À toi de jouer !').waitFor({ timeout: 10000 })
  await pc.locator('.ag-card.ag-morpion', { hasText: 'Game 2' }).waitFor({ timeout: 10000 })
  await pc.locator('.ag-card.ag-morpion', { hasText: 'Game 2' }).locator('.series-line', { hasText: /1 – 0|0 – 1/ }).waitFor({ timeout: 10000 })
  log('revanche lancée, série affichée')
  // Hub du téléphone, onglet Asynchrone : « En cours dans ce groupe » ramène à la carte dans le fil.
  await phone.getByRole('button', { name: 'Jouer' }).click()
  await phone.getByRole('tab', { name: /Asynchrone/ }).click()
  await phone.locator('.ongoing-item', { hasText: 'Morpion' }).first().click()
  await phone.locator('.ag-card.flash').waitFor({ timeout: 8000 })
  assert.ok(await phone.locator('.ag-card.flash').isVisible(), 'la carte est mise en avant à l’écran')
  log('liste « En cours » : retour à la carte dans le fil')

  // 4. Quiz en direct : lobby, une question, révélation.
  await pc.getByRole('button', { name: 'Play' }).click()
  await pc.getByRole('tab', { name: /Live/ }).click()
  await pc.getByRole('button', { name: 'Start Pack Quiz' }).click()
  await pc.getByText('Pack Quiz · Lobby').waitFor({ timeout: 10000 })
  await shot(pc, 'v2-07-quiz-lobby-en')
  const join = phone.locator('.game-card').getByRole('button', { name: 'Rejoindre' }).last()
  await join.waitFor({ timeout: 10000 })
  await join.click()
  await phone.getByText('Quiz de la meute · Lobby').waitFor({ timeout: 10000 })
  await pc.getByText('Players (2/8)').waitFor({ timeout: 10000 })
  await pc.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '5', exact: true }).click()
  await sleep(1500)
  await pc.getByRole('button', { name: 'Start the game' }).click()
  for (const p of [pc, phone]) await p.locator('.quiz-choice').first().waitFor({ timeout: 10000 })
  await shot(phone, 'v2-08-quiz-question-phone')
  await pc.locator('.quiz-choice').nth(0).click()
  await phone.getByText('1/2 ont répondu').waitFor({ timeout: 8000 })
  await phone.locator('.quiz-choice').nth(1).click()
  for (const p of [pc, phone]) await p.locator('.quiz-choice.correct').waitFor({ timeout: 10000 })
  await shot(pc, 'v2-09-quiz-reveal-pc')
  log('manche de quiz jouée et révélée sur les deux appareils')
  await pc.getByRole('button', { name: 'Quit' }).click()
  await pc.getByRole('dialog').getByRole('button', { name: 'Quit' }).click()
  await pc.locator('.room-screen').waitFor({ timeout: 10000 })

  if (errors.length) throw new Error(`Erreurs navigateur :\n${errors.join('\n')}`)
  console.log('\n✔ Parcours v2 validé (FR + EN, photo, jeu de conversation, jeu en direct)')
} catch (err) {
  for (const p of [pc, phone]) await shot(p, `v2-fail-${p.label.replace(/\W+/g, '-')}`).catch(() => {})
  console.error('✘', err)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
