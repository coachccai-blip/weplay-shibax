// Lobby commun : joueurs présents, réglages proposés par le jeu, durée estimée, « Lancer ».
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Avatar, Shiba } from '../components/Shiba.js'
import { Segmented, Switch } from '../components/ui.js'
import { game, joinGame, leaveGame, startGame, saveSettings } from '../state/game.js'
import { me } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { useNow } from '../lib/layout.js'
import { serverNow } from '../lib/clock.js'
import { mmss, minutesLabel } from '../lib/format.js'
import { THEMES, THEME_IDS, DRAWIT, defaultTours, LIMITS } from '../../shared/constants.js'

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
          <${Shiba} mood="fete" coat="roux" size=${56} />
          <div class="grow">
            <h2>Draw It · Lobby</h2>
            <p class="small muted">Hôte de la partie : <b>${host?.pseudo || '—'}</b> · se ferme dans ${mmss(v.lobbyExpiresAt - now)}</p>
          </div>
        </div>
        <h3 class="section-title" style=${{ marginTop: 0 }}><${Icon} name="users" size=${20} /> Joueurs (${players.length}/${v.maxPlayers})</h3>
        <ul class="lobby-players">
          ${players.map((p) => {
            const here = p.id === myId || (presence[p.id] && serverNow() - presence[p.id] < LIMITS.presenceMs)
            return html`<li class="lobby-player" key=${p.id}>
              <${Avatar} user=${p} size=${56} mood=${here ? 'content' : 'concentre'} />
              <span class="ellipsis" style=${{ maxWidth: '100%' }}>${p.pseudo}${p.id === myId ? ' (toi)' : ''}</span>
              <span class="tiny row" style=${{ gap: '4px' }}><span class=${`dot ${here ? 'on' : 'off'}`} aria-hidden="true"></span>${here ? 'prêt' : 'pas encore là'}</span>
              ${p.id === v.hostId && html`<span class="pill butter tiny"><${Icon} name="crown" size=${12} /> hôte</span>`}
            </li>`
          })}
          ${players.length < v.minPlayers && html`<li class="lobby-player empty-slot">En attente d’un ami…</li>`}
        </ul>
        <p class="small muted" style=${{ marginTop: '12px' }}>Les membres du salon voient l’invitation dans le fil et peuvent toucher « Rejoindre ».</p>
      </section>
      <section class="card">
        <h3 class="section-title" style=${{ marginTop: 0 }}><${Icon} name="edit" size=${20} /> Réglages ${!isHost && html`<span class="pill white tiny">choisis par l’hôte</span>`}</h3>
        <${DrawItSettings} v=${v} editable=${isHost} playerCount=${players.length} />
        <p class="row small" style=${{ marginTop: '8px' }}><${Icon} name="clock" size=${18} /> Durée estimée : <b>≈ ${minutesLabel(v.estimateSec)}</b> au plus</p>
      </section>
    </div>
    <div class="lobby-cta" style=${{ maxWidth: '980px', margin: '0 auto' }}>
      ${!joined
        ? html`<button class="btn btn-primary btn-big" disabled=${busy || players.length >= v.maxPlayers} onClick=${() => run(joinGame)}>
            ${players.length >= v.maxPlayers ? 'Partie complète' : 'Rejoindre la partie'}</button>`
        : isHost
          ? html`<button class="btn btn-primary btn-big" disabled=${busy || !enough} onClick=${() => run(startGame)}>
              <${Icon} name="play" /> ${enough ? 'Lancer la partie' : `Il faut au moins ${v.minPlayers} joueurs`}</button>`
          : html`<p class="center pill sky" style=${{ alignSelf: 'center', padding: '10px 16px' }}>En attente du lancement par ${host?.pseudo || 'l’hôte'}…</p>`}
      ${joined && html`<button class="btn btn-ghost" onClick=${leave} disabled=${busy}>Quitter le lobby</button>`}
    </div>
  </div>`
}

function DrawItSettings({ v, editable, playerCount }) {
  if (v.type !== 'drawit') return html`<p class="small">Jeu de test : ${v.settings.rounds} manches de ${v.settings.roundSec} s.</p>`
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
      <div class="setting-head"><span>Joueurs</span><span class="pill white">${playerCount} inscrit${playerCount > 1 ? 's' : ''} · 2 à 8</span></div>
    </div>
    <div class="setting">
      <div class="setting-head"><span>Tours</span></div>
      <${Segmented} label="Nombre de tours" disabled=${!editable} value=${s.tours} onChange=${(t) => update({ tours: t })}
        options=${[{ value: 'auto', label: `Auto (${autoTours})` }, ...DRAWIT.tourChoices.map((n) => ({ value: n, label: String(n) }))]} />
      <span class="field-hint">Auto : 2 tours jusqu’à 5 joueurs, 1 tour à partir de 6. Chacun dessine une fois par tour.</span>
    </div>
    <div class="setting">
      <div class="setting-head"><span>Temps de dessin</span></div>
      <${Segmented} label="Temps de dessin" disabled=${!editable} value=${s.drawTime} onChange=${(t) => update({ drawTime: t })}
        options=${DRAWIT.drawTimes.map((n) => ({ value: n, label: `${n} s` }))} />
    </div>
    <div class="setting">
      <div class="switch-row">
        <span><b>Mots perso</b><br /><span class="field-hint">Le dessinateur peut proposer son propre mot.</span></span>
        <${Switch} label="Mots perso autorisés" checked=${s.custom} disabled=${!editable} onChange=${(c) => update({ custom: c })} />
      </div>
    </div>
    <div class="setting">
      <div class="setting-head"><span>Thèmes</span><span class="pill white">${s.themes === 'all' ? 'Tous' : `${themes.length}/6`}</span></div>
      <div class="chips" role="group" aria-label="Thèmes des mots">
        ${THEMES.map(
          (t) => html`<button type="button" class="chip" aria-pressed=${String(themes.includes(t.id))} disabled=${!editable} onClick=${() => toggleTheme(t.id)}>
            ${themes.includes(t.id) && html`<${Icon} name="check" size=${16} />`} ${t.name}</button>`,
        )}
      </div>
    </div>
  </div>`
}
