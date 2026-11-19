// Racine de l'application : démarrage, mise en page adaptative (1, 2 ou 3 colonnes), fenêtres.
import { useEffect } from 'preact/hooks'
import { html } from './lib/html.js'
import { route } from './lib/router.js'
import { layout } from './lib/layout.js'
import { boot, me, initApp, refreshMe, celebrations, keyReminderPending, modal, openModal } from './state/core.js'
import { rooms, room, closeRoom, loadRooms, openRoom } from './state/rooms.js'
import { startSync, stopSync } from './state/sync.js'
import { Icon } from './components/icons.js'
import { Shiba } from './components/Shiba.js'
import { Toasts, NetBanner, ModalHost, ConfirmSheet, ErrorState } from './components/ui.js'
import { Welcome, Login, Revoked } from './screens/Welcome.js'
import { RoomsList, CreateRoomSheet, JoinCodeSheet, PickRoom } from './screens/Rooms.js'
import { RoomScreen, ReactionPicker, RoomInfoSheet, MembersSheet, LeaderboardSheet, InviteSheet, RoomMenuSheet, RenameSheet, listCollapsed } from './screens/Room.js'
import { RoomSide } from './screens/RoomSide.js'
import { Hub } from './screens/Hub.js'
import { GameScreen } from './screens/Game.js'
import { Profile, QrSheet, KeyReminderSheet, PhotoSheet } from './screens/Profile.js'
import { AsyncSetupSheet } from './games/async/Setup.js'
import { t } from './i18n/index.js'
import { JoinScreen, LinkScreen, Privacy, Celebration } from './screens/Misc.js'
import { Lightbox } from './screens/Lightbox.js'
import { invitePending } from './state/invite.js'

const MODALS = {
  createRoom: CreateRoomSheet,
  joinCode: JoinCodeSheet,
  invite: InviteSheet,
  roomInfo: RoomInfoSheet,
  members: MembersSheet,
  leaderboard: LeaderboardSheet,
  roomMenu: RoomMenuSheet,
  rename: RenameSheet,
  confirm: ConfirmSheet,
  qr: QrSheet,
  keyReminder: KeyReminderSheet,
  photo: PhotoSheet,
  asyncSetup: AsyncSetupSheet,
}

function Overlays() {
  // Le rappel de la clé attend la fin des célébrations (badges, niveau).
  useEffect(() => {
    if (keyReminderPending.value && !celebrations.value.length && !modal.value) {
      keyReminderPending.value = false
      openModal('keyReminder')
    }
  }, [keyReminderPending.value, celebrations.value.length, modal.value])
  return html`<${ModalHost} registry=${MODALS} /><${ReactionPicker} /><${Lightbox} /><${Celebration} /><${Toasts} /><${NetBanner} />`
}

function TabBar() {
  const r = route.value.name
  const unread = rooms.value.reduce((s, x) => s + (x.unread || 0), 0)
  return html`<nav class="tabbar" aria-label=${t('nav.main')}>
    <a href="#/" aria-current=${r === 'home' ? 'page' : undefined}><${Icon} name="chat" /> ${t('nav.groups')}
      ${unread > 0 && html`<span class="badge-count" aria-label=${t('nav.unread', { n: unread })}>${unread > 99 ? '99+' : unread}</span>`}</a>
    <a href="#/profil" aria-current=${r === 'profile' ? 'page' : undefined}><${Icon} name="user" /> ${t('nav.profile')}</a>
  </nav>`
}

function Shell() {
  const r = route.value
  const lay = layout.value
  const rid = r.params?.rid

  // Un seul groupe ouvert à la fois : on referme l'ancien quand on en change.
  useEffect(() => {
    if (room.value && room.value.rid !== rid) closeRoom()
  }, [rid])

  useEffect(() => {
    loadRooms()
    startSync()
    const timer = setInterval(() => !document.hidden && refreshMe(), 60000)
    return () => {
      clearInterval(timer)
      stopSync()
    }
  }, [])

  let content
  switch (r.name) {
    case 'room':
      content = html`<${RoomScreen} key=${rid} rid=${rid} />`
      break
    case 'hub':
      content = html`<${HubWithRoom} rid=${rid} />`
      break
    case 'game':
      content = html`<${GameScreen} key=${r.params.gid} rid=${rid} gid=${r.params.gid} />`
      break
    case 'profile':
      content = html`<${Profile} />`
      break
    case 'join':
      content = html`<${JoinScreen} code=${r.params.code} />`
      break
    case 'privacy':
      content = html`<${Privacy} />`
      break
    default:
      content = lay === 'mobile' ? html`<${RoomsList} />` : html`<${PickRoom} />`
  }
  const showList = lay !== 'mobile'
  const sideOn = lay === 'desktop' && (r.name === 'room' || r.name === 'hub') && room.value?.info
  const tabs = lay === 'mobile' && (r.name === 'home' || r.name === 'profile' || r.name === 'privacy')
  return html`<div class="shell" data-list=${lay === 'tablet' && listCollapsed.value ? 'collapsed' : 'open'} data-side=${sideOn ? 'on' : 'off'}>
    ${showList && html`<aside class="pane pane-list" aria-label=${t('rooms.title')}><${RoomsList} /></aside>`}
    <main class="pane pane-main" id="main">${content}</main>
    ${sideOn && html`<aside class="pane pane-side" aria-label=${t('room.sideAria')}><${RoomSide} /></aside>`}
    ${tabs && html`<${TabBar} />`}
  </div>`
}

function HubWithRoom({ rid }) {
  useEffect(() => {
    if (!room.value || room.value.rid !== rid) openRoom(rid)
  }, [rid])
  return html`<${Hub} rid=${rid} />`
}

export function App() {
  const b = boot.value
  const r = route.value
  useEffect(() => {
    window.__shxBooted = true
  }, [])

  if (r.name === 'link') return html`<${LinkScreen} token=${r.params.token} /><${Overlays} />`
  if (b.status === 'loading') {
    return html`<div class="boot"><${Shiba} body wag size=${120} label=${t('common.loading')} /><p class="boot-title">Weplay Shibax</p><p class="boot-text">${t('boot.wag')}</p></div>`
  }
  if (b.status === 'error') {
    return html`<div class="fill-center" style=${{ height: '100%' }}><${ErrorState} title=${t('boot.unreachable')} error=${{ message: b.messageKey ? t(b.messageKey) : b.message }} onRetry=${initApp} /></div>`
  }
  if (b.status === 'revoked') {
    return html`${r.name === 'login' ? html`<${Login} />` : html`<${Revoked} message=${b.messageKey ? t(b.messageKey) : b.message} />`}<${Overlays} />`
  }
  const user = me.value
  if (!user) return null
  if (r.name === 'login') return html`<${Login} /><${Overlays} />`
  if (!user.onboarded) {
    if (r.name === 'privacy') return html`<${Privacy} /><${Overlays} />`
    return html`<${Welcome} inviteName=${invitePending.value?.name} /><${Overlays} />`
  }
  return html`<${Shell} /><${Overlays} />`
}
