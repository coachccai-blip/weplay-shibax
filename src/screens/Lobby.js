// Lobby commun : joueurs présents, règles, réglages proposés par le jeu, durée estimée, « Lancer ».
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Avatar } from '../components/Shiba.js'
import { Segmented, Switch } from '../components/ui.js'
import { game, joinGame, leaveGame, startGame, saveSettings } from '../state/game.js'
import { me } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { useNow } from '../lib/layout.js'
import { serverNow } from '../lib/clock.js'
import { mmss, minutesLabel } from '../lib/format.js'
import { t, tn } from '../i18n/index.js'
import { gameName } from '../i18n/texts.js'
import { THEMES, THEME_IDS, DRAWIT, defaultTours, LIMITS, LIVE_ROUNDS, GAME_CATALOG } from '../../shared/constants.js'

export function Lobby({ rid }) {
  const g = game.value
  const v = g.view
  const myId = me.value.id
  const isHost = v.hostId === myId
  const players = v.players.filter((p) => !p.left)
  const joined = players.some((p) => p.id === myId)
  const now = useNow(1000)
  const [busy, setBusy] = useState(false)
  const presence = g.presence || {}
  const enough = players.length >= v.minPlayers
  const emoji = GAME_CATALOG.find((x) => x.id === v.type)?.emoji || '🎮'
  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      /* message déjà affiché */
    }
    setBusy(false)
  }
  const leave = async () => {
    await run(leaveGame)
    navigate(paths.room(rid), { replace: true })
  }
  const host = v.players.find((p) => p.id === v.hostId)
  return html`<div class="screen-body">
    <div class="lobby">
      <section class="card">
        <div class="row" style=${{ marginBottom: '12px' }}>
          <span class="lobby-emoji" aria-hidden="true">${emoji}</span>
          <div class="grow">
            <h2>${t('lobby.title', { game: gameName(v.type) })}</h2>
            <p class="small muted">${t('lobby.hostLine', { pseudo: host?.pseudo || '—', time: mmss(v.lobbyExpiresAt - now) })}</p>
          </div>
        </div>
        <p class="small lobby-rules">${t(`game.${v.type}.rules`)}</p>
        <h3 class="section-title"><${Icon} name="users" size=${20} /> ${t('lobby.players', { n: players.length, max: v.maxPlayers })}</h3>
        <ul class="lobby-players">
          ${players.map((p) => {
            const here = p.id === myId || (presence[p.id] && serverNow() - presence[p.id] < LIMITS.presenceMs)
            return html`<li class="lobby-player" key=${p.id}>
              <${Avatar} user=${p} size=${56} mood=${here ? 'content' : 'concentre'} />
              <span class="ellipsis" style=${{ maxWidth: '100%' }}>${p.pseudo}${p.id === myId ? ` ${t('common.youParen')}` : ''}</span>
              <span class="tiny row" style=${{ gap: '4px' }}><span class=${`dot ${here ? 'on' : 'off'}`} aria-hidden="true"></span>${here ? t('lobby.ready') : t('lobby.notHere')}</span>
              ${p.id === v.hostId && html`<span class="pill butter tiny"><${Icon} name="crown" size=${12} /> ${t('lobby.host')}</span>`}
            </li>`
          })}
          ${players.length < v.minPlayers && html`<li class="lobby-player empty-slot">${t('lobby.waitingFriend')}</li>`}
        </ul>
        <p class="small muted" style=${{ marginTop: '12px' }}>${t('lobby.inviteHint')}</p>
      </section>
      <section class="card">
        <h3 class="section-title" style=${{ marginTop: 0 }}><${Icon} name="edit" size=${20} /> ${t('lobby.settings')} ${!isHost && html`<span class="pill white tiny">${t('lobby.byHost')}</span>`}</h3>
        ${v.type === 'drawit'
          ? html`<${DrawItSettings} v=${v} editable=${isHost} playerCount=${players.length} />`
          : LIVE_ROUNDS[v.type]
            ? html`<${RoundSettings} v=${v} editable=${isHost} />`
            : html`<p class="small">${t('lobby.testGame', { rounds: v.settings.rounds, s: v.settings.roundSec })}</p>`}
        <p class="row small" style=${{ marginTop: '8px' }}><${Icon} name="clock" size=${18} /> ${t('lobby.duration', { time: minutesLabel(v.estimateSec) })}</p>
      </section>
    </div>
    <div class="lobby-cta" style=${{ maxWidth: '980px', margin: '0 auto' }}>
      ${!joined
        ? html`<button class="btn btn-primary btn-big" disabled=${busy || players.length >= v.maxPlayers} onClick=${() => run(joinGame)}>
            ${players.length >= v.maxPlayers ? t('lobby.full') : t('lobby.join')}</button>`
        : isHost
          ? html`<button class="btn btn-primary btn-big" disabled=${busy || !enough} onClick=${() => run(startGame)}>
              <${Icon} name="play" /> ${enough ? t('lobby.start') : tn('lobby.needPlayers', v.minPlayers)}</button>`
          : html`<p class="center pill sky" style=${{ alignSelf: 'center', padding: '10px 16px' }}>${t('lobby.waitingHost', { pseudo: host?.pseudo || t('lobby.host') })}</p>`}
      ${joined && html`<button class="btn btn-ghost" onClick=${leave} disabled=${busy}>${t('lobby.leave')}</button>`}
    </div>
  </div>`
}

/** Réglages des jeux par manches : nombre de manches et langue des questions. */
function RoundSettings({ v, editable }) {
  const s = v.settings
  const conf = LIVE_ROUNDS[v.type]
  const update = (patch) => editable && saveSettings(patch).catch(() => {})
  return html`<div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.rounds')}</span></div>
      <${Segmented} label=${t('lobby.rounds')} disabled=${!editable} value=${s.rounds} onChange=${(n) => update({ rounds: n })}
        options=${conf.choices.map((n) => ({ value: n, label: String(n) }))} />
    </div>
    ${conf.content &&
    html`<div class="setting">
      <div class="setting-head"><span>${t('lobby.contentLang')}</span></div>
      <${Segmented} label=${t('lobby.contentLang')} disabled=${!editable} value=${s.lang} onChange=${(l) => update({ lang: l })}
        options=${[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
      <span class="field-hint">${t('lobby.contentLangHint')}</span>
    </div>`}
  </div>`
}

function DrawItSettings({ v, editable, playerCount }) {
  const s = v.settings
  // On n'envoie que le réglage modifié : le serveur fusionne (deux clics rapprochés ne s'écrasent pas).
  const update = (patch) => editable && saveSettings(patch).catch(() => {})
  const autoTours = defaultTours(Math.max(2, playerCount))
  const themes = s.themes === 'all' ? THEME_IDS : s.themes
  const toggleTheme = (id) => {
    const set = new Set(themes)
    if (set.has(id)) {
      if (set.size === 1) return
      set.delete(id)
    } else set.add(id)
    update({ themes: set.size === THEME_IDS.length ? 'all' : [...set] })
  }
  return html`<div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.playersLabel')}</span><span class="pill white">${tn('lobby.registered', playerCount)} · ${t('hub.players', { min: 2, max: 8 })}</span></div>
    </div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.tours')}</span></div>
      <${Segmented} label=${t('lobby.tours')} disabled=${!editable} value=${s.tours} onChange=${(x) => update({ tours: x })}
        options=${[{ value: 'auto', label: t('lobby.toursAuto', { n: autoTours }) }, ...DRAWIT.tourChoices.map((n) => ({ value: n, label: String(n) }))]} />
      <span class="field-hint">${t('lobby.toursHint')}</span>
    </div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.drawTime')}</span></div>
      <${Segmented} label=${t('lobby.drawTime')} disabled=${!editable} value=${s.drawTime} onChange=${(x) => update({ drawTime: x })}
        options=${DRAWIT.drawTimes.map((n) => ({ value: n, label: `${n} s` }))} />
    </div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.contentLang')}</span></div>
      <${Segmented} label=${t('lobby.contentLang')} disabled=${!editable} value=${s.lang || 'fr'} onChange=${(l) => update({ lang: l })}
        options=${[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
    </div>
    <div class="setting">
      <div class="switch-row">
        <span><b>${t('lobby.custom')}</b><br /><span class="field-hint">${t('lobby.customHint')}</span></span>
        <${Switch} label=${t('lobby.custom')} checked=${s.custom} disabled=${!editable} onChange=${(c) => update({ custom: c })} />
      </div>
    </div>
    <div class="setting">
      <div class="setting-head"><span>${t('lobby.themes')}</span><span class="pill white">${s.themes === 'all' ? t('lobby.allThemes') : `${themes.length}/6`}</span></div>
      <div class="chips" role="group" aria-label=${t('lobby.themes')}>
        ${THEMES.map(
          (th) => html`<button type="button" class="chip" key=${th.id} aria-pressed=${String(themes.includes(th.id))} disabled=${!editable} onClick=${() => toggleTheme(th.id)}>
            ${themes.includes(th.id) && html`<${Icon} name="check" size=${16} />`} ${t(`theme.${th.id}`)}</button>`,
        )}
      </div>
    </div>
  </div>`
}
