// Cartes de jeu dans le fil : invitation (statut en direct) puis résultats (podium, dessins, « Rejouer »).
import { useEffect, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { me, errorToast } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { fetchSummary, createGame } from '../state/game.js'
import { api } from '../lib/transport.js'
import { minutesLabel } from '../lib/format.js'
import { drawItDuration } from '../../shared/constants.js'
import { openLightbox } from './Lightbox.js'

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
  lobby: { label: 'En attente', cls: 'sky' },
  playing: { label: 'En cours', cls: 'mint' },
  finished: { label: 'Terminée', cls: 'butter' },
  cancelled: { label: 'Annulée', cls: 'coral' },
}

function settingsLine(settings, n) {
  if (!settings) return ''
  const tours = settings.tours === 'auto' ? 'tours auto' : `${settings.tours} tour${settings.tours > 1 ? 's' : ''}`
  return `${tours} · ${settings.drawTime} s par dessin · ≈ ${minutesLabel(drawItDuration(settings, Math.max(2, n)))}`
}

export function GameCard({ m, r }) {
  if (m.kind === 'results') return html`<${ResultsCard} m=${m} r=${r} />`
  return html`<${InviteCard} m=${m} r=${r} />`
}

function InviteCard({ m, r }) {
  const live = r.game?.id === m.gid ? r.game : null
  const resultsShown = r.messages.some((x) => x.type === 'game' && x.kind === 'results' && x.gid === m.gid)
  const fetched = useSummary(m.gid, !!live || resultsShown)
  const s = live || fetched
  const status = s?.status || (resultsShown ? 'finished' : null)
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
  const st = STATUS[status] || { label: '…', cls: 'white' }
  return html`<article class="game-card" aria-label="Invitation à une partie de Draw It">
    <div class="game-card-head">
      <span class="art"><${Shiba} coat=${m.a?.c || 'roux'} mood="concentre" size=${44} /></span>
      <div class="grow">
        <h3>Draw It</h3>
        <p class="small">Partie lancée par <b>${m.a?.p || 'un membre'}</b></p>
      </div>
      <span class=${`pill ${st.cls}`}>${st.label}</span>
    </div>
    ${s?.settings && html`<p class="settings-line">${settingsLine(s.settings, s.players?.length || 2)}</p>`}
    ${s?.players?.length > 0 &&
    html`<div class="row wrap">
      <div class="avatar-row" aria-label=${`${s.players.length} joueurs inscrits`}>${s.players.slice(0, 8).map((p) => html`<${Avatar} key=${p.id} user=${p} size=${32} />`)}</div>
      <span class="small">${s.players.length} inscrit${s.players.length > 1 ? 's' : ''}</span>
    </div>`}
    ${status === 'lobby' &&
    (joined
      ? html`<button class="btn btn-primary btn-small" onClick=${open}>Ouvrir le lobby</button>`
      : html`<button class="btn btn-primary btn-small" onClick=${join}>Rejoindre</button>`)}
    ${status === 'playing' &&
    (joined
      ? html`<button class="btn btn-primary btn-small" onClick=${open}>Retourner à la partie</button>`
      : html`<button class="btn btn-secondary btn-small" onClick=${join}>Rejoindre (dès la manche suivante)</button>`)}
  </article>`
}

function ResultsCard({ m, r }) {
  const podium = m.podium || []
  const order = [podium[1], podium[0], podium[2]].filter(Boolean)
  const heights = { 1: 54, 2: 40, 3: 30 }
  const replay = async () => {
    try {
      const g = await createGame(r.rid, m.gtype || 'drawit', m.gid)
      navigate(paths.game(r.rid, g.id))
    } catch (err) {
      errorToast(err)
    }
  }
  const drawings = m.drawings || []
  return html`<article class="game-card results" aria-label="Résultats de la partie de Draw It">
    <div class="game-card-head">
      <span class="art"><${Icon} name="trophy" size=${30} /></span>
      <div class="grow">
        <h3>Résultats de Draw It</h3>
        <p class="small">${podium[0] ? html`<b>${podium[0].pseudo}</b> l’emporte avec ${podium[0].score} points !` : 'Partie terminée.'}</p>
      </div>
    </div>
    ${order.length > 0 &&
    html`<div class="mini-podium" aria-label="Podium">
      ${order.map(
        (p) => html`<div class="spot" key=${p.uid}>
          <${Shiba} coat=${p.coat} acc=${p.acc} mood=${p.rank === 1 ? 'fete' : 'content'} size=${p.rank === 1 ? 52 : 42} />
          <span class="ellipsis" style=${{ maxWidth: '90px' }}>${p.pseudo}</span>
          <div class="step" style=${{ height: `${heights[p.rank] || 30}px` }}>${p.rank}</div>
        </div>`,
      )}
    </div>`}
    ${drawings.length > 0 &&
    html`<div class="thumbs" aria-label="Dessins de la partie">
      ${drawings.map(
        (d) => html`<button class="thumb" key=${d.r} aria-label=${`Agrandir le dessin « ${d.word} »`}
          onClick=${() => openLightbox(drawings.map((x) => ({ src: `/api/games/${m.gid}/drawings/${x.r}`, word: x.word })), drawings.indexOf(d))}>
          <img src=${`/api/games/${m.gid}/drawings/${d.r}`} alt=${`Dessin : ${d.word}`} loading="lazy" onError=${(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <span class="word">${d.word}</span>
        </button>`,
      )}
    </div>`}
    <div class="row wrap">
      <button class="btn btn-primary btn-small grow" onClick=${replay}><${Icon} name="refresh" /> Rejouer</button>
      <button class="btn btn-secondary btn-small" onClick=${() => navigate(paths.game(r.rid, m.gid))}>Détails</button>
    </div>
  </article>`
}
