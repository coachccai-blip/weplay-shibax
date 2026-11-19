// « Mes groupes » : chaque groupe privé avec son dernier message, ses non lus et sa partie en cours.
// On peut créer et rejoindre autant de groupes qu'on veut (50 au plus).
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { Sheet, EmptyState } from '../components/ui.js'
import { rooms, roomsLoaded, createRoom, joinByCode, previewInvite } from '../state/rooms.js'
import { me, openModal, closeModal } from '../state/core.js'
import { navigate, paths, route } from '../lib/router.js'
import { shortWhen, initials, roomColor } from '../lib/format.js'
import { layout } from '../lib/layout.js'
import { load, save } from '../lib/storage.js'
import { normalizeInviteInput, INVITE_RE } from '../../shared/ids.js'
import { LIMITS } from '../../shared/constants.js'
import { t, tn, errorText } from '../i18n/index.js'
import { previewText } from '../i18n/texts.js'

export function RoomsList() {
  const list = rooms.value
  const active = route.value.params?.rid
  const user = me.value
  return html`<section class="screen" aria-labelledby="rooms-title">
    <header class="screen-header">
      <div class="brand grow">
        <img src="/img/logo-256.webp" width="40" height="40" alt="" />
        <div class="titles">
          <h1 id="rooms-title" class="brand-name">${t('rooms.title')}</h1>
          <p class="subtitle">${list.length ? tn('rooms.count', list.length) : 'Weplay Shibax'}</p>
        </div>
      </div>
      ${layout.value !== 'mobile' &&
      html`<a class="icon-btn filled" href="#/profil" aria-label=${t('profile.title')}><${Avatar} user=${user} size=${34} /></a>`}
    </header>
    <div class="rooms-actions">
      <button class="btn btn-primary" onClick=${() => openModal('createRoom')}><${Icon} name="plus" /> ${t('rooms.create')}</button>
      <button class="btn btn-secondary" onClick=${() => openModal('joinCode')}><${Icon} name="link" /> ${t('rooms.joinCode')}</button>
    </div>
    <div class="screen-body" style=${{ padding: 0 }}>
      ${!roomsLoaded.value && !list.length
        ? html`<div class="fill-center"><${Shiba} body wag size=${90} label=${t('common.loading')} /></div>`
        : !list.length
          ? html`<${EmptyState} mood="content" coat="roux" title=${t('rooms.emptyTitle')} text=${t('rooms.emptyText')} />`
          : html`<ul class="room-list">
              ${list.map((r) => html`<li key=${r.id}><${RoomItem} r=${r} active=${active === r.id} /></li>`)}
            </ul>`}
      <${OtherDeviceCard} />
    </div>
  </section>`
}

function RoomItem({ r, active }) {
  const preview = previewText(r.last, me.value?.id)
  return html`<a class=${`room-item ${r.unread ? 'unread' : ''}`} href=${`#${paths.room(r.id)}`} aria-current=${active ? 'page' : undefined}>
    <span class="room-avatar" style=${{ background: roomColor(r.id) }} aria-hidden="true">${initials(r.name)}</span>
    <span class="room-main">
      <span class="room-top">
        <span class="room-name ellipsis">${r.name}</span>
        <span class="room-time">${shortWhen(r.last?.ts)}</span>
      </span>
      <span class="room-bottom">
        <span class="room-preview ellipsis">${preview}</span>
        ${r.game && html`<span class="pill"><${Icon} name="gamepad" size=${14} /> ${r.game.status === 'playing' ? t('rooms.gamePlaying') : t('rooms.gameLobby')}</span>`}
        ${r.unread > 0 && html`<span class="badge-count" aria-label=${tn('rooms.unread', r.unread)}>${r.unread > 99 ? '99+' : r.unread}</span>`}
      </span>
    </span>
  </a>`
}

/** Sur PC : invitation à relier son téléphone au même compte (QR code), tant qu'un seul appareil est connecté. */
function OtherDeviceCard() {
  const [hidden, setHidden] = useState(load('shx.hideDeviceCard', false))
  const devices = me.value?.devices || []
  if (hidden || layout.value === 'mobile' || devices.length > 1) return null
  return html`<div class="device-card">
    <${Icon} name="qr" size=${28} />
    <div class="grow">
      <b>${t('devices.cardTitle')}</b>
      <p class="small">${t('devices.cardText')}</p>
      <div class="row wrap" style=${{ marginTop: '6px' }}>
        <button class="btn btn-small btn-lavender" onClick=${() => openModal('qr')}>${t('devices.showQr')}</button>
        <button class="btn btn-small btn-ghost" onClick=${() => {
          save('shx.hideDeviceCard', true)
          setHidden(true)
        }}>${t('common.later')}</button>
      </div>
    </div>
  </div>`
}

export function CreateRoomSheet() {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const len = Array.from(name.trim()).length
    if (len < LIMITS.roomNameMin || len > LIMITS.roomNameMax) return setError(t('err.room_name'))
    setBusy(true)
    try {
      const room = await createRoom(name.trim())
      closeModal()
      navigate(paths.room(room.id))
      setTimeout(() => openModal('invite', { first: true }), 400)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return html`<${Sheet} title=${t('rooms.create')} onClose=${closeModal}>
    <form class="col" style=${{ gap: '16px' }} onSubmit=${submit}>
      <div class="field">
        <label for="room-name">${t('rooms.nameLabel')}</label>
        <input id="room-name" class="input" value=${name} maxlength="40" placeholder=${t('rooms.namePlaceholder')} autofocus
          onInput=${(e) => {
            setName(e.currentTarget.value)
            setError(null)
          }} />
        <span class="field-hint">${t('rooms.nameHint')}</span>
      </div>
      ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <button class="btn btn-primary btn-block" disabled=${busy}>${t('rooms.createSubmit')}</button>
    </form>
  </${Sheet}>`
}

export function JoinCodeSheet() {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const c = normalizeInviteInput(code)
    if (!INVITE_RE.test(c)) return setError(t('rooms.codeFormat'))
    setBusy(true)
    try {
      const p = await previewInvite(c)
      if (p.status === 'member') {
        closeModal()
        return navigate(paths.room(p.room.id))
      }
      if (p.status === 'expired') throw new Error(t('err.invite_expired'))
      if (p.status === 'full') throw new Error(t('err.room_full'))
      const room = await joinByCode(c)
      closeModal()
      navigate(paths.room(room.id))
    } catch (err) {
      setError(err.code ? errorText(err) : err.message)
      setBusy(false)
    }
  }
  return html`<${Sheet} title=${t('rooms.joinCode')} onClose=${closeModal}>
    <form class="col" style=${{ gap: '16px' }} onSubmit=${submit}>
      <div class="field">
        <label for="invite-code">${t('rooms.codeLabel')}</label>
        <input id="invite-code" class="input code" value=${code} maxlength="7" placeholder="ABC234" autocapitalize="characters" autocomplete="off" autofocus
          onInput=${(e) => {
            setCode(e.currentTarget.value.toUpperCase())
            setError(null)
          }} />
      </div>
      ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <button class="btn btn-primary btn-block" disabled=${busy}>${t('rooms.joinSubmit')}</button>
    </form>
  </${Sheet}>`
}

/** Écran « Choisis un groupe » (PC et tablette, quand aucun groupe n'est ouvert). */
export function PickRoom() {
  return html`<div class="fill-center">
    <${EmptyState} mood="content" coat="creme" title=${t('rooms.pickTitle')} text=${t('rooms.pickText')} />
  </div>`
}
