import { render } from 'preact'
import { html } from './lib/html.js'
import { App } from './app.js'
import { route } from './lib/router.js'
import { initApp, me } from './state/core.js'
import { previewInvite } from './state/rooms.js'
import { invitePending } from './state/invite.js'
import { effect } from '@preact/signals'
import './styles/base.css'
import './styles/layout.css'
import './styles/chat.css'
import './styles/game.css'
import './styles/profile.css'

// Le lien du QR code connecte l'appareil à un compte existant : pas de compte neuf dans ce cas.
if (route.value.name !== 'link') initApp()

// Arrivée par un lien d'invitation : on retient le salon pour l'écran de bienvenue.
const dispose = effect(() => {
  const r = route.value
  const user = me.value
  if (r.name === 'join' && user && !user.onboarded && !invitePending.value) {
    invitePending.value = { code: r.params.code, name: null }
    previewInvite(r.params.code)
      .then((p) => (invitePending.value = { code: r.params.code, name: p.room?.name || null, status: p.status }))
      .catch(() => {})
  }
})

render(html`<${App} />`, document.getElementById('app'))

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

export { dispose }
