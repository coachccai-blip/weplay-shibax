// Hub de jeux : le catalogue, ouvert par « Jouer ». Draw It est jouable, les autres arrivent bientôt.
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba } from '../components/Shiba.js'
import { room } from '../state/rooms.js'
import { createGame } from '../state/game.js'
import { errorToast } from '../state/core.js'
import { navigate, back, paths } from '../lib/router.js'
import { GAME_CATALOG } from '../../shared/constants.js'

function Art({ id }) {
  if (id === 'drawit') {
    return html`<svg width="150" height="110" viewBox="0 0 150 110" aria-hidden="true">
      <rect x="64" y="14" width="80" height="62" rx="10" fill="#fff" />
      <path d="M76 58c10-22 22 4 32-12s18 6 26-6" fill="none" stroke="#3fb6f0" stroke-width="5" stroke-linecap="round" />
      <circle cx="118" cy="30" r="7" fill="#f6c700" />
      <path d="M58 88l34-34 8 8-34 34-11 3z" fill="#f0569b" />
      <path d="M92 54l8 8 5-5-8-8z" fill="#4A3B36" />
    </svg>`
  }
  return html`<svg width="110" height="90" viewBox="0 0 110 90" aria-hidden="true">
    <rect x="15" y="15" width="80" height="60" rx="14" fill="#fff" opacity="0.8" />
    <text x="55" y="56" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="34" fill="#7A6A64">?</text>
  </svg>`
}

export function Hub({ rid }) {
  const r = room.value
  const [busy, setBusy] = useState(false)
  const active = r?.game && (r.game.status === 'lobby' || r.game.status === 'playing') ? r.game : null
  const launch = async (type) => {
    setBusy(true)
    try {
      const g = await createGame(rid, type)
      navigate(paths.game(rid, g.id), { replace: true })
    } catch (err) {
      errorToast(err)
      setBusy(false)
    }
  }
  return html`<section class="screen" aria-labelledby="hub-title">
    <header class="screen-header">
      <button class="icon-btn" onClick=${() => back(paths.room(rid))} aria-label="Retour au salon"><${Icon} name="back" /></button>
      <div class="titles"><h1 id="hub-title">Jouer</h1><p class="subtitle">${r?.info?.name || ''}</p></div>
    </header>
    <div class="screen-body">
      ${active &&
      html`<div class="game-banner" style=${{ margin: '0 0 16px' }}>
        <${Icon} name="gamepad" /><span class="grow">Une partie est déjà en cours dans ce salon : une seule à la fois !</span>
        <button class="btn btn-small btn-primary" onClick=${() => navigate(paths.game(rid, active.id))}>Voir la partie</button>
      </div>`}
      <div class="hub-grid">
        ${GAME_CATALOG.map((gm) => {
          const ok = gm.available && !active
          return html`<button class="game-tile" key=${gm.id} disabled=${!ok || busy} onClick=${() => launch(gm.id)}
            aria-label=${gm.available ? `Lancer ${gm.name}` : `${gm.name} : bientôt disponible`}>
            ${!gm.available && html`<span class="soon-ribbon">Bientôt</span>`}
            <span class="art">${gm.id === 'drawit' ? html`<span class="row"><${Shiba} body coat="roux" mood="concentre" size=${90} /><${Art} id=${gm.id} /></span>` : html`<${Art} id=${gm.id} />`}</span>
            <h3>${gm.name}</h3>
            <span class="small">${gm.tagline}</span>
            <span class="facts"><span class="pill white"><${Icon} name="users" size=${14} /> ${gm.players}</span><span class="pill white"><${Icon} name="clock" size=${14} /> ${gm.duration}</span></span>
          </button>`
        })}
      </div>
    </div>
  </section>`
}
