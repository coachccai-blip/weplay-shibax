// « Mes salons » : dernier message, non lus, partie en cours ; créer ou rejoindre un salon.
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba } from '../components/Shiba.js'
import { Sheet, EmptyState } from '../components/ui.js'
import { rooms, roomsLoaded, createRoom, joinByCode, previewInvite } from '../state/rooms.js'
import { me, openModal, closeModal } from '../state/core.js'
import { navigate, paths, route } from '../lib/router.js'
import { shortWhen, initials, roomColor } from '../lib/format.js'
import { layout } from '../lib/layout.js'
import { normalizeInviteInput, INVITE_RE } from '../../shared/ids.js'
import { LIMITS } from '../../shared/constants.js'

export function RoomsList() {
  const list = rooms.value
  const active = route.value.params?.rid
  const user = me.value
  return html`<section class="screen" aria-labelledby="rooms-title">
    <header class="screen-header">
      <div class="brand grow">
        <img src="/img/logo-256.webp" width="40" height="40" alt="" />
        <div class="titles">
          <h1 id="rooms-title" class="brand-name">Mes salons</h1>
          <p class="subtitle">Weplay Shibax</p>
        </div>
      </div>
      ${layout.value !== 'mobile' &&
      html`<a class="icon-btn filled" href="#/profil" aria-label="Mon profil"><${Shiba} coat=${user.coat} acc=${user.acc} size=${34} /></a>`}
    </header>
    <div class="rooms-actions">
      <button class="btn btn-primary" onClick=${() => openModal('createRoom')}><${Icon} name="plus" /> Créer un salon</button>
      <button class="btn btn-secondary" onClick=${() => openModal('joinCode')}><${Icon} name="link" /> Rejoindre avec un code</button>
    </div>
    <div class="screen-body" style=${{ padding: 0 }}>
      ${!roomsLoaded.value && !list.length
        ? html`<div class="fill-center"><${Shiba} body wag size=${90} /></div>`
        : !list.length
          ? html`<${EmptyState} mood="content" coat="roux" title="Aucun salon pour l’instant"
              text="Crée ton premier salon et partage le lien d’invitation à tes amis, ou rejoins-en un avec un code." />`
          : html`<ul class="room-list">
              ${list.map((r) => html`<li key=${r.id}><${RoomItem} r=${r} active=${active === r.id} /></li>`)}
            </ul>`}
    </div>
  </section>`
}

function RoomItem({ r, active }) {
  const last = r.last
  const mine = last?.author === me.value?.id
  const preview = !last ? 'Aucun message' : last.type === 'text' ? `${mine ? 'Toi' : last.pseudo || 'Quelqu’un'} : ${last.preview}` : last.preview
  return html`<a class=${`room-item ${r.unread ? 'unread' : ''}`} href=${`#${paths.room(r.id)}`} aria-current=${active ? 'page' : undefined}>
    <span class="room-avatar" style=${{ background: roomColor(r.id) }} aria-hidden="true">${initials(r.name)}</span>
    <span class="room-main">
      <span class="room-top">
        <span class="room-name ellipsis">${r.name}</span>
        <span class="room-time">${shortWhen(last?.ts)}</span>
      </span>
      <span class="room-bottom">
        <span class="room-preview ellipsis">${preview}</span>
        ${r.game && html`<span class="pill"><${Icon} name="gamepad" size=${14} /> ${r.game.status === 'playing' ? 'Partie en cours' : 'Lobby ouvert'}</span>`}
        ${r.unread > 0 && html`<span class="badge-count" aria-label=${`${r.unread} non lus`}>${r.unread > 99 ? '99+' : r.unread}</span>`}
      </span>
    </span>
  </a>`
}

export function CreateRoomSheet() {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const len = Array.from(name.trim()).length
    if (len < LIMITS.roomNameMin || len > LIMITS.roomNameMax) return setError('Entre 3 et 30 caractères.')
    setBusy(true)
    try {
      const room = await createRoom(name.trim())
      closeModal()
      navigate(paths.room(room.id))
      setTimeout(() => openModal('invite', { first: true }), 400)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return html`<${Sheet} title="Créer un salon" onClose=${closeModal}>
    <form class="col" style=${{ gap: '16px' }} onSubmit=${submit}>
      <div class="field">
        <label for="room-name">Nom du salon</label>
        <input id="room-name" class="input" value=${name} maxlength="40" placeholder="La meute du jeudi" autofocus
          onInput=${(e) => {
            setName(e.currentTarget.value)
            setError(null)
          }} />
        <span class="field-hint">Tu en seras l’hôte. Tu pourras inviter jusqu’à 19 amis.</span>
      </div>
      ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <button class="btn btn-primary btn-block" disabled=${busy}>Créer le salon</button>
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
    if (!INVITE_RE.test(c)) return setError('Le code compte 6 caractères (lettres et chiffres).')
    setBusy(true)
    try {
      const p = await previewInvite(c)
      if (p.status === 'member') {
        closeModal()
        return navigate(paths.room(p.room.id))
      }
      if (p.status === 'expired') throw new Error('Invitation expirée : demande un nouveau code à l’hôte.')
      if (p.status === 'full') throw new Error('Salon complet : 20 membres au maximum.')
      const room = await joinByCode(c)
      closeModal()
      navigate(paths.room(room.id))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return html`<${Sheet} title="Rejoindre avec un code" onClose=${closeModal}>
    <form class="col" style=${{ gap: '16px' }} onSubmit=${submit}>
      <div class="field">
        <label for="invite-code">Code d’invitation</label>
        <input id="invite-code" class="input code" value=${code} maxlength="7" placeholder="ABC234" autocapitalize="characters" autocomplete="off" autofocus
          onInput=${(e) => {
            setCode(e.currentTarget.value.toUpperCase())
            setError(null)
          }} />
      </div>
      ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <button class="btn btn-primary btn-block" disabled=${busy}>Rejoindre</button>
    </form>
  </${Sheet}>`
}

/** Écran « Choisis un salon » (PC et tablette, quand aucun salon n'est ouvert). */
export function PickRoom() {
  return html`<div class="fill-center">
    <${EmptyState} mood="content" coat="creme" title="Choisis un salon" text="Ouvre une conversation à gauche, ou crée un salon pour inviter ta meute." />
  </div>`
}
