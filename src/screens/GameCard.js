// Cartes de jeu dans le fil : invitation à une partie en direct (statut en direct), résultats
// (podium, dessins, « Rejouer ») et jeux dans la conversation (carte jouable, voir games/async).
import { useEffect, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { me, errorToast } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { fetchSummary, createGame } from '../state/game.js'
import { api } from '../lib/transport.js'
import { minutesLabel } from '../lib/format.js'
import { t, tn } from '../i18n/index.js'
import { gameName } from '../i18n/texts.js'
import { drawItDuration, LIVE_ROUNDS, GAME_CATALOG } from '../../shared/constants.js'
import { openLightbox } from './Lightbox.js'
import { AsyncCard } from '../games/async/AsyncCard.js'

const summaries = new Map()

function useSummary(gid, skip) {
  const [s, setS] = useState(summaries.get(gid) || null)
  useEffect(() => {
    if (skip || summaries.has(gid)) return
    let alive = true
    fetchSummary(gid)
      .then((res) => {
        summaries.set(gid, res.summary)
        if (alive) setS(res.summary)
      })
      .catch(() => {})
    return () => (alive = false)
  }, [gid, skip])
  return s
}

const STATUS = {
  lobby: { key: 'card.status.lobby', cls: 'sky' },
  playing: { key: 'card.status.playing', cls: 'mint' },
  finished: { key: 'card.status.finished', cls: 'butter' },
  cancelled: { key: 'card.status.cancelled', cls: 'coral' },
}

function settingsLine(type, settings, n) {
  if (!settings) return ''
  if (type === 'drawit') {
    const tours = settings.tours === 'auto' ? t('card.toursAuto') : tn('card.tours', settings.tours)
    return `${tours} · ${t('card.perDrawing', { s: settings.drawTime })} · ≈ ${minutesLabel(drawItDuration(settings, Math.max(2, n)))}`
  }
  const live = LIVE_ROUNDS[type]
  if (!live) return ''
  const parts = [tn('card.rounds', settings.rounds)]
  if (live.content && settings.lang) parts.push(t(`lang.content.${settings.lang}`))
  return parts.join(' · ')
}

const emojiOf = (type) => GAME_CATALOG.find((g) => g.id === type)?.emoji || '🎮'

export function GameCard({ m, r }) {
  if (m.kind === 'async') return html`<${AsyncCard} m=${m} r=${r} />`
  if (m.kind === 'results') return html`<${ResultsCard} m=${m} r=${r} />`
  return html`<${InviteCard} m=${m} r=${r} />`
}

function InviteCard({ m, r }) {
  const live = r.game?.id === m.gid ? r.game : null
  const resultsShown = r.messages.some((x) => x.type === 'game' && x.kind === 'results' && x.gid === m.gid)
  const fetched = useSummary(m.gid, !!live || resultsShown)
  const s = live || fetched
  const status = s?.status || (resultsShown ? 'finished' : null)
  const type = m.gtype || s?.type || 'drawit'
  const myId = me.value.id
  const joined = s?.players?.some((p) => p.id === myId)
  const open = () => navigate(paths.game(r.rid, m.gid))
  const join = async () => {
    try {
      await api.post(`games/${m.gid}/join`)
      open()
    } catch (err) {
      errorToast(err)
    }
  }
  const st = STATUS[status] ? { label: t(STATUS[status].key), cls: STATUS[status].cls } : { label: '…', cls: 'white' }
  return html`<article class="game-card" aria-label=${t('card.inviteAria', { game: gameName(type) })}>
    <div class="game-card-head">
      <span class="art">${type === 'drawit' ? html`<${Shiba} coat=${m.a?.c || 'roux'} mood="concentre" size=${44} />` : html`<span class="ag-emoji" aria-hidden="true">${emojiOf(type)}</span>`}</span>
      <div class="grow">
        <h3>${gameName(type)}</h3>
        <p class="small">${t('card.launchedBy', { pseudo: m.a?.p || t('common.aMember') })}</p>
      </div>
      <span class=${`pill ${st.cls}`}>${st.label}</span>
    </div>
    ${s?.settings && html`<p class="settings-line">${settingsLine(type, s.settings, s.players?.length || 2)}</p>`}
    ${s?.players?.length > 0 &&
    html`<div class="row wrap">
      <div class="avatar-row" aria-label=${tn('card.joinedCount', s.players.length)}>${s.players.slice(0, 8).map((p) => html`<${Avatar} key=${p.id} user=${p} size=${32} />`)}</div>
      <span class="small">${tn('card.joinedCount', s.players.length)}</span>
    </div>`}
    ${status === 'lobby' &&
    (joined
      ? html`<button class="btn btn-primary btn-small" onClick=${open}>${t('card.openLobby')}</button>`
      : html`<button class="btn btn-primary btn-small" onClick=${join}>${t('common.join')}</button>`)}
    ${status === 'playing' &&
    (joined
      ? html`<button class="btn btn-primary btn-small" onClick=${open}>${t('card.backToGame')}</button>`
      : html`<button class="btn btn-secondary btn-small" onClick=${join}>${t('card.joinNextRound')}</button>`)}
  </article>`
}

function ResultsCard({ m, r }) {
  const podium = m.podium || []
  const order = [podium[1], podium[0], podium[2]].filter(Boolean)
  const heights = { 1: 54, 2: 40, 3: 30 }
  const type = m.gtype || 'drawit'
  const replay = async () => {
    try {
      const g = await createGame(r.rid, type, m.gid)
      navigate(paths.game(r.rid, g.id))
    } catch (err) {
      errorToast(err)
    }
  }
  const drawings = m.drawings || []
  return html`<article class="game-card results" aria-label=${t('card.resultsAria', { game: gameName(type) })}>
    <div class="game-card-head">
      <span class="art"><${Icon} name="trophy" size=${30} /></span>
      <div class="grow">
        <h3>${t('card.resultsOf', { game: gameName(type) })}</h3>
        <p class="small">${podium[0] ? t('card.winnerLine', { pseudo: podium[0].pseudo, score: podium[0].score }) : t('card.over')}</p>
      </div>
    </div>
    ${order.length > 0 &&
    html`<div class="mini-podium" aria-label=${t('results.podium')}>
      ${order.map(
        (p) => html`<div class="spot" key=${p.uid}>
          <${Avatar} user=${{ id: p.uid, coat: p.coat, acc: p.acc }} mood=${p.rank === 1 ? 'fete' : 'content'} size=${p.rank === 1 ? 52 : 42} />
          <span class="ellipsis" style=${{ maxWidth: '90px' }}>${p.pseudo}</span>
          <div class="step" style=${{ height: `${heights[p.rank] || 30}px` }}>${p.rank}</div>
        </div>`,
      )}
    </div>`}
    ${drawings.length > 0 &&
    html`<div class="thumbs" aria-label=${t('card.drawings')}>
      ${drawings.map(
        (d) => html`<button class="thumb" key=${d.r} aria-label=${t('card.zoomDrawing', { word: d.word })}
          onClick=${() => openLightbox(drawings.map((x) => ({ src: `/api/games/${m.gid}/drawings/${x.r}`, word: x.word })), drawings.indexOf(d))}>
          <img src=${`/api/games/${m.gid}/drawings/${d.r}`} alt=${t('card.drawingAlt', { word: d.word })} loading="lazy" onError=${(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <span class="word">${d.word}</span>
        </button>`,
      )}
    </div>`}
    <div class="row wrap">
      <button class="btn btn-primary btn-small grow" onClick=${replay}><${Icon} name="refresh" /> ${t('common.replay')}</button>
      <button class="btn btn-secondary btn-small" onClick=${() => navigate(paths.game(r.rid, m.gid))}>${t('card.details')}</button>
    </div>
  </article>`
}
