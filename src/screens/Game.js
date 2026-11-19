// Écran de partie : lobby, jeu (propre à chaque jeu), résultats — même adresse du début à la fin.
import { useEffect } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba } from '../components/Shiba.js'
import { EmptyState, ErrorState } from '../components/ui.js'
import { game, openGame, closeGame, leaveGame } from '../state/game.js'
import { room, openRoom } from '../state/rooms.js'
import { openModal } from '../state/core.js'
import { navigate, back, paths } from '../lib/router.js'
import { layout } from '../lib/layout.js'
import { Lobby } from './Lobby.js'
import { Results } from './Results.js'
import { GAME_UI } from '../games/registry.js'
import { listCollapsed } from './Room.js'

export function GameScreen({ rid, gid }) {
  useEffect(() => {
    openGame(gid)
    if (!room.value || room.value.rid !== rid) openRoom(rid)
  }, [gid])
  useEffect(() => () => closeGame(), [])
  const g = game.value
  const title = room.value?.info?.name || 'Partie'
  const v = g?.gid === gid ? g.view : null
  const playing = v?.status === 'playing'
  const quit = () => {
    if (playing && v.me.isPlayer) {
      openModal('confirm', {
        title: 'Quitter la partie ?',
        text: 'Tes points acquis comptent. Tu pourras revenir via le bandeau du salon (dès la manche suivante).',
        confirm: 'Quitter',
        danger: true,
        onConfirm: async () => {
          await leaveGame()
          navigate(paths.room(rid), { replace: true })
        },
      })
    } else navigate(paths.room(rid))
  }
  return html`<section class="screen" aria-label="Partie">
    <header class="screen-header">
      ${layout.value === 'tablet' &&
      html`<button class="icon-btn" aria-pressed=${String(!listCollapsed.value)} onClick=${() => (listCollapsed.value = !listCollapsed.value)}
        aria-label="Afficher ou replier la liste des salons"><${Icon} name="sidebar" /></button>`}
      <button class="icon-btn" onClick=${() => back(paths.room(rid))} aria-label="Retour au salon"><${Icon} name="back" /></button>
      <div class="titles">
        <h1 class="ellipsis">Draw It</h1>
        <p class="subtitle ellipsis">${title}</p>
      </div>
      ${playing && v.me.isPlayer && html`<button class="btn btn-ghost btn-small" onClick=${quit}><${Icon} name="door" /> Quitter</button>`}
    </header>
    ${!g || g.gid !== gid || g.loading
      ? html`<div class="fill-center"><${Shiba} body wag size=${100} label="Chargement de la partie" /></div>`
      : g.error
        ? html`<div class="fill-center"><${ErrorState} error=${g.error} onRetry=${() => {
            closeGame()
            openGame(gid)
          }} /></div>`
        : html`<${GameBody} rid=${rid} v=${v} />`}
  </section>`
}

function GameBody({ rid, v }) {
  if (v.status === 'lobby') return html`<${Lobby} rid=${rid} />`
  if (v.status === 'finished') return html`<${Results} rid=${rid} />`
  if (v.status === 'cancelled') {
    return html`<div class="fill-center"><${EmptyState} mood="triste" title="Partie annulée"
      text=${v.endReason === 'timeout' ? 'Le lobby est resté 10 minutes sans lancement.' : 'Tout le monde a quitté le lobby.'}>
      <button class="btn btn-primary" onClick=${() => navigate(paths.hub(rid))}>Relancer une partie</button>
      <button class="btn btn-secondary" onClick=${() => navigate(paths.room(rid))}>Retour au salon</button>
    </${EmptyState}></div>`
  }
  const UI = GAME_UI[v.type]
  return UI ? html`<${UI} />` : html`<p class="center">Jeu inconnu.</p>`
}
