// Hub de jeux, ouvert par « Jouer » : deux onglets pour filtrer d'un geste.
// « Direct » : 7 jeux en même temps pour tous (lobby puis partie) ;
// « Asynchrone » : 7 jeux dans la conversation, chacun à son rythme, et la liste des jeux en cours du groupe.
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { room } from '../state/rooms.js'
import { createGame } from '../state/game.js'
import { me, errorToast, openModal } from '../state/core.js'
import { focusAsync } from '../state/async.js'
import { navigate, back, paths } from '../lib/router.js'
import { load, save } from '../lib/storage.js'
import { t, tn } from '../i18n/index.js'
import { gameName } from '../i18n/texts.js'
import { asyncNeedsMe } from '../games/async/AsyncCard.js'
import { GAME_CATALOG } from '../../shared/constants.js'

const TABS = ['sync', 'async']

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
    <span class="tile-text">
      <h3>${gameName(gm.id)}</h3>
      <span class="small">${t(`game.${gm.id}.tagline`)}</span>
      <span class="facts">
        <span class="pill white"><${Icon} name="users" size=${14} /> ${f.players}</span>
        <span class="pill white"><${Icon} name=${gm.mode === 'sync' ? 'clock' : 'hourglass'} size=${14} /> ${f.time}</span>
      </span>
    </span>
  </button>`
}

/** Jeux de conversation en cours dans le groupe : ceux qui attendent un coup de ma part d'abord. */
function OngoingAsync({ r, rid }) {
  const myId = me.value.id
  const list = Object.values(r?.asyncGames || {})
    .filter((g) => !g.missing && g.status === 'open')
    .map((g) => ({ g, mine: asyncNeedsMe(g, myId) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (b.g.updatedAt || 0) - (a.g.updatedAt || 0))
  if (!list.length) return html`<p class="small muted ongoing-empty">${t('hub.noOngoing')}</p>`
  const go = (id) => {
    focusAsync(id)
    navigate(paths.room(rid))
  }
  return html`<ul class="ongoing">
    ${list.slice(0, 12).map(
      ({ g, mine }) => html`<li key=${g.id}>
        <button class="ongoing-item" onClick=${() => go(g.id)}>
          <span class="ongoing-emoji" aria-hidden="true">${GAME_CATALOG.find((x) => x.id === g.type)?.emoji || '🎲'}</span>
          <span class="grow ellipsis"><b>${gameName(g.type)}</b></span>
          <span class=${`pill ${mine ? 'apricot' : 'mint'}`}>${mine ? t('ag.status.yourTurn') : t('ag.status.open')}</span>
          <${Icon} name="chevron" size=${18} />
        </button>
      </li>`,
    )}
  </ul>`
}

export function Hub({ rid }) {
  const r = room.value
  const [busy, setBusy] = useState(false)
  const [tab, setTabState] = useState(() => (TABS.includes(load('shx.hubTab')) ? load('shx.hubTab') : 'sync'))
  const setTab = (next) => {
    setTabState(next)
    save('shx.hubTab', next)
  }
  const active = r?.game && (r.game.status === 'lobby' || r.game.status === 'playing') ? r.game : null
  const myId = me.value?.id
  const waiting = Object.values(r?.asyncGames || {}).filter((g) => asyncNeedsMe(g, myId)).length
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
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length]
    setTab(next)
    document.getElementById(`hub-tab-${next}`)?.focus()
  }
  const games = GAME_CATALOG.filter((g) => g.mode === tab)
  return html`<section class="screen" aria-labelledby="hub-title">
    <header class="screen-header">
      <button class="icon-btn" onClick=${() => back(paths.room(rid))} aria-label=${t('room.backToGroup')}><${Icon} name="back" /></button>
      <div class="titles"><h1 id="hub-title">${t('hub.title')}</h1><p class="subtitle">${r?.info?.name || ''}</p></div>
    </header>
    <div class="screen-body">
      <div class="hub">
        <div class="hub-tabs" role="tablist" aria-label=${t('hub.tabsAria')} onKeyDown=${onKey}>
          ${TABS.map((id) => {
            const count = GAME_CATALOG.filter((g) => g.mode === id).length
            return html`<button key=${id} id=${`hub-tab-${id}`} role="tab" class="hub-tab" aria-selected=${String(tab === id)} aria-controls="hub-panel"
              tabindex=${tab === id ? 0 : -1} onClick=${() => setTab(id)}>
              <${Icon} name=${id === 'sync' ? 'bolt' : 'chat'} size=${20} />
              <span>${t(`hub.tab.${id}`)}</span>
              <span class="tab-count">${count}</span>
              ${id === 'async' && waiting > 0 && html`<span class="badge-count" aria-label=${tn('hub.waitingAria', waiting)}>${waiting}</span>`}
              ${id === 'sync' && active && html`<span class="live-dot" aria-label=${t('hub.liveNow')}></span>`}
            </button>`
          })}
        </div>
        <div id="hub-panel" role="tabpanel" aria-labelledby=${`hub-tab-${tab}`} class="hub-panel">
          <p class="small muted hub-hint">${tab === 'sync' ? t('hub.liveHint') : t('hub.asyncHint')}</p>
          ${tab === 'sync' && active &&
          html`<div class="game-banner">
            <${Icon} name="gamepad" /><span class="grow">${t('hub.oneAtATime')}</span>
            <button class="btn btn-small btn-primary" onClick=${() => navigate(paths.game(rid, active.id))}>${t('hub.seeGame')}</button>
          </div>`}
          ${tab === 'async' &&
          html`<section class="ongoing-box" aria-labelledby="ongoing-title">
            <h2 id="ongoing-title" class="section-title"><${Icon} name="hourglass" size=${20} /> ${t('hub.ongoing')}</h2>
            <${OngoingAsync} r=${r} rid=${rid} />
          </section>
          <h2 class="section-title"><${Icon} name="plus" size=${20} /> ${t('hub.newGame')}</h2>`}
          <div class="hub-grid">
            ${games.map((gm) =>
              gm.mode === 'sync'
                ? html`<${Tile} key=${gm.id} gm=${gm} disabled=${!!active || busy} onClick=${() => launch(gm.id)} />`
                : html`<${Tile} key=${gm.id} gm=${gm} disabled=${!r?.info} onClick=${() => openModal('asyncSetup', { type: gm.id, rid })} />`,
            )}
          </div>
        </div>
      </div>
    </div>
  </section>`
}
