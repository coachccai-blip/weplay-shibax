// Écran du jeu factice (tests automatisés du cadre commun, masqué du hub).
import { html } from '../../lib/html.js'
import { game, act } from '../../state/game.js'
import { useNow } from '../../lib/layout.js'
import { errorToast } from '../../state/core.js'
import { t } from '../../i18n/index.js'

export function TestGame() {
  const v = game.value.view
  const now = useNow(250)
  const gs = v.g
  const tap = () => act({ type: 'tap' }).catch(errorToast)
  return html`<div class="screen-body"><div class="results center">
    <h2>${t('test.round', { n: gs.round + 1, total: gs.rounds })}</h2>
    <p class="timer" style=${{ alignSelf: 'center' }}>${Math.max(0, Math.ceil((gs.phaseEnd - now) / 1000))} s</p>
    <button class="btn btn-primary btn-big" onClick=${tap}>${t('test.tap')}</button>
    <ol class="ranking">${v.players.map((p) => html`<li key=${p.id}><span class="grow">${p.pseudo}</span><b>${p.score}</b></li>`)}</ol>
  </div></div>`
}
