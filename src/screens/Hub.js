// Hub de jeux, ouvert par « Jouer » : 7 jeux en direct (lobby puis partie, tout le monde en même temps)
// et 7 jeux dans la conversation (une carte dans le fil, chacun joue à son rythme).
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { room } from '../state/rooms.js'
import { createGame } from '../state/game.js'
import { errorToast, openModal } from '../state/core.js'
import { navigate, back, paths } from '../lib/router.js'
import { t, tn } from '../i18n/index.js'
import { gameName } from '../i18n/texts.js'
import { GAME_CATALOG } from '../../shared/constants.js'

function facts(gm) {
  const players = gm.duel ? t('hub.duel') : gm.mode === 'async' ? t('hub.wholeGroup') : t('hub.players', { min: gm.min, max: gm.max })
  const time =
    gm.mode === 'sync' ? t('hub.minutes', { a: gm.minutes[0], b: gm.minutes[1] }) : gm.hours >= 48 ? tn('hub.days', Math.round(gm.hours / 24)) : tn('hub.hours', gm.hours)
  return { players, time }
}

function Tile({ gm, onClick, disabled }) {
  const f = facts(gm)
  return html`<button class=${`game-tile mode-${gm.mode}`} disabled=${disabled} onClick=${onClick} aria-label=${t('hub.launchAria', { game: gameName(gm.id) })}>
    <span class="art" aria-hidden="true"><span class="tile-emoji">${gm.emoji}</span></span>
    <h3>${gameName(gm.id)}</h3>
    <span class="small">${t(`game.${gm.id}.tagline`)}</span>
    <span class="facts">
      <span class="pill white"><${Icon} name="users" size=${14} /> ${f.players}</span>
      <span class="pill white"><${Icon} name=${gm.mode === 'sync' ? 'clock' : 'hourglass'} size=${14} /> ${f.time}</span>
    </span>
  </button>`
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
      <button class="icon-btn" onClick=${() => back(paths.room(rid))} aria-label=${t('room.backToGroup')}><${Icon} name="back" /></button>
      <div class="titles"><h1 id="hub-title">${t('hub.title')}</h1><p class="subtitle">${r?.info?.name || ''}</p></div>
    </header>
    <div class="screen-body">
      <div class="hub">
        <div class="hub-head">
          <h2 class="section-title"><${Icon} name="bolt" size=${22} /> ${t('hub.live')}</h2>
          <p class="small muted">${t('hub.liveHint')}</p>
        </div>
        ${active &&
        html`<div class="game-banner">
          <${Icon} name="gamepad" /><span class="grow">${t('hub.oneAtATime')}</span>
          <button class="btn btn-small btn-primary" onClick=${() => navigate(paths.game(rid, active.id))}>${t('hub.seeGame')}</button>
        </div>`}
        <div class="hub-grid">
          ${GAME_CATALOG.filter((g) => g.mode === 'sync').map((gm) => html`<${Tile} key=${gm.id} gm=${gm} disabled=${!!active || busy} onClick=${() => launch(gm.id)} />`)}
        </div>
        <div class="hub-head">
          <h2 class="section-title"><${Icon} name="chat" size=${22} /> ${t('hub.async')}</h2>
          <p class="small muted">${t('hub.asyncHint')}</p>
        </div>
        <div class="hub-grid">
          ${GAME_CATALOG.filter((g) => g.mode === 'async').map(
            (gm) => html`<${Tile} key=${gm.id} gm=${gm} disabled=${!r?.info} onClick=${() => openModal('asyncSetup', { type: gm.id, rid })} />`,
          )}
        </div>
      </div>
    </div>
  </section>`
}
