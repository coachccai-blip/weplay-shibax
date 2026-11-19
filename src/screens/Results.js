// Résultats : podium, classement complet, XP gagnée (barre qui se remplit), badges, dessins, « Rejouer ».
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { XpBar } from '../components/ui.js'
import { game, createGame } from '../state/game.js'
import { me, refreshMe, queueCelebration, keyReminderPending, errorToast } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { play, confetti } from '../lib/fx.js'
import { load, save } from '../lib/storage.js'
import { levelFromXp } from '../../shared/progression.js'
import { t, tn } from '../i18n/index.js'
import { xpLineText, badgeName } from '../i18n/texts.js'
import { openLightbox } from './Lightbox.js'

const ENDINGS = { complete: 'results.endComplete', not_enough: 'results.endNotEnough' }

export function Results({ rid }) {
  const g = game.value
  const v = g.view
  const myId = me.value.id
  const ranking = v.results?.ranking || []
  const rewards = v.rewards || {}
  const mine = rewards[myId]
  const byId = Object.fromEntries(v.players.map((p) => [p.id, p]))
  const podium = [ranking[1], ranking[0], ranking[2]].filter(Boolean)
  const [busy, setBusy] = useState(false)
  const [fill, setFill] = useState(null)
  const celebratedRef = useRef(false)

  // Célébrations (une seule fois par partie et par appareil).
  useEffect(() => {
    if (!v.rewardsDone || celebratedRef.current) return
    celebratedRef.current = true
    const done = new Set(load('shx.celebratedGames', []))
    const first = !done.has(v.id)
    if (first) {
      done.add(v.id)
      save('shx.celebratedGames', [...done].slice(-40))
    }
    const myRank = ranking.find((r) => r.uid === myId)?.rank
    if (first && myRank === 1) {
      play('win')
      confetti()
    }
    if (mine) {
      const before = levelFromXp(Math.max(0, mine.xpAfter - mine.xp))
      setFill({ from: before, to: levelFromXp(mine.xpAfter) })
      if (first) {
        if (mine.levelAfter > mine.levelBefore) setTimeout(() => queueCelebration({ type: 'level', level: mine.levelAfter, accessories: mine.accessories }), 1400)
        for (const b of mine.badges || []) queueCelebration({ type: 'badge', id: b })
      }
    }
    refreshMe().then((m) => {
      if (first && mine?.valid && m && m.stats?.games === 1 && !m.keyReminderShown) setTimeout(() => (keyReminderPending.value = true), 2500)
    })
  }, [v.rewardsDone])

  const replay = async () => {
    setBusy(true)
    try {
      const next = await createGame(rid, v.type, v.id)
      navigate(paths.game(rid, next.id))
    } catch (err) {
      errorToast(err)
      setBusy(false)
    }
  }

  const drawings = v.results?.drawings || []
  return html`<div class="screen-body">
    <div class="results">
      <div class="center">
        <h2>${t('results.title')}</h2>
        <p class="muted small">${t(ENDINGS[v.endReason] || ENDINGS.complete)}</p>
      </div>
      ${v.nextGameId &&
      html`<div class="game-banner"><span class="grow">${t('results.nextOpen')}</span>
        <button class="btn btn-small btn-primary" onClick=${() => navigate(paths.game(rid, v.nextGameId))}>${t('results.goThere')}</button></div>`}
      <div class="podium" aria-label=${t('results.podium')}>
        ${podium.map(
          (r) => html`<div class="podium-spot" key=${r.uid}>
            <${Shiba} body coat=${byId[r.uid]?.coat} acc=${byId[r.uid]?.acc} mood=${r.rank === 1 ? 'fete' : 'content'} size=${r.rank === 1 ? 110 : 84} />
            <span class="who row" style=${{ gap: '6px', justifyContent: 'center' }}><${Avatar} user=${byId[r.uid]} size=${26} /><span class="ellipsis">${byId[r.uid]?.pseudo}</span></span>
            <span class="small">${t('results.points', { n: r.score })}</span>
            <div class=${`podium-step r${r.rank}`}>${r.rank}</div>
          </div>`,
        )}
      </div>
      ${!v.rewardsDone && html`<div class="row" style=${{ justifyContent: 'center' }}><${Shiba} body wag size=${48} /><span class="muted">${t('results.computing')}</span></div>`}
      ${v.rewardsDone && v.results && !v.results.valid &&
      html`<p class="card small center">${t('results.tooShort')}</p>`}
      ${mine && mine.valid &&
      html`<section class="card col">
        <div class="row"><b class="grow">${t('results.yourXp', { n: mine.xp })}</b><span class="pill butter">${t('common.level', { n: mine.levelAfter })}</span></div>
        <${XpBarAnimated} fill=${fill} />
        <ul class="xp-lines">${mine.lines.map((l, i) => html`<li key=${i}><span>${l.key ? xpLineText(l) : l.label}</span><b>+${l.xp}</b></li>`)}</ul>
        ${mine.badges?.length > 0 &&
        html`<p class="small"><b>${t('results.badges')}</b> ${mine.badges.map(badgeName).join(', ')}</p>`}
      </section>`}
      <section>
        <h3 class="section-title">${t('results.ranking')}</h3>
        <ol class="ranking">
          ${ranking.map(
            (r) => html`<li key=${r.uid} class=${r.uid === myId ? 'me' : ''}>
              <span class="rank">${r.rank}</span>
              <${Avatar} user=${byId[r.uid]} size=${36} />
              <span class="grow"><b>${byId[r.uid]?.pseudo}</b>${byId[r.uid]?.left ? html` <span class="pill white tiny">${t('results.left')}</span>` : ''}<br />
                <span class="tiny muted">${t('results.points', { n: r.score })} · ${tn(v.type === 'drawit' ? 'results.wordsFound' : 'results.goodAnswers', r.found)}</span></span>
              ${rewards[r.uid] && html`<span class="xp-gain">+${rewards[r.uid].xp} XP</span>`}
            </li>`,
          )}
        </ol>
      </section>
      ${drawings.length > 0 &&
      html`<section>
        <h3 class="section-title">${t('results.drawings')}</h3>
        <div class="thumbs" style=${{ flexWrap: 'wrap' }}>
          ${drawings.map(
            (d, i) => html`<button class="thumb" key=${d.r} style=${{ width: '140px' }} aria-label=${t('card.zoomDrawing', { word: d.word })}
              onClick=${() => openLightbox(drawings.map((x) => ({ src: `/api/games/${v.id}/drawings/${x.r}`, word: x.word })), i)}>
              <img src=${`/api/games/${v.id}/drawings/${d.r}`} alt=${t('card.drawingAlt', { word: d.word })} loading="lazy" onError=${(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span class="word">${d.word} · ${byId[d.drawerId]?.pseudo || ''}</span>
            </button>`,
          )}
        </div>
      </section>`}
    </div>
    <div class="results-actions" style=${{ maxWidth: '760px', margin: '0 auto' }}>
      <button class="btn btn-primary btn-big" onClick=${replay} disabled=${busy}><${Icon} name="refresh" /> ${t('common.replay')}</button>
      <button class="btn btn-secondary btn-big" onClick=${() => navigate(paths.room(rid))}><${Icon} name="chat" /> ${t('room.backToGroup')}</button>
    </div>
  </div>`
}

function XpBarAnimated({ fill }) {
  const [p, setP] = useState(fill?.from.progress || 0)
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!fill) return
    setP(fill.from.progress)
    const timer = setTimeout(() => {
      setP(fill.to.level > fill.from.level ? 1 : fill.to.progress)
      if (fill.to.level > fill.from.level) setTimeout(() => setP(fill.to.progress), 1300)
    }, 300)
    setLabel(t('common.xpToNext', { into: fill.to.into, needed: fill.to.needed, n: fill.to.level + 1 }))
    return () => clearTimeout(timer)
  }, [fill])
  return html`<div class="col" style=${{ gap: '4px' }}><${XpBar} progress=${p} /><span class="tiny muted">${label}</span></div>`
}
