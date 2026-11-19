// Salon : fil de messages, saisie, bouton « Jouer », membres, classement, bandeau de partie en cours.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Shiba, Avatar, ReactionIcon } from '../components/Shiba.js'
import { Sheet, EmptyState, ErrorState, copyText, ConfirmSheet } from '../components/ui.js'
import { room, openRoom, sendMessage, retryMessage, discardMessage, loadOlder, toggleReaction, slowUntil, canSendNow, resetInvite, leaveRoom, renameRoom } from '../state/rooms.js'
import { api } from '../lib/transport.js'
import { me, openModal, closeModal, toast, errorToast } from '../state/core.js'
import { navigate, back, paths, absoluteUrl } from '../lib/router.js'
import { layout, finePointer, useNow } from '../lib/layout.js'
import { hhmm, dayLabel, sameDay, isEmojiOnly, plural } from '../lib/format.js'
import { serverNow } from '../lib/clock.js'
import { GameCard } from './GameCard.js'
import { MembersPanel, LeaderboardPanel, InviteBox } from './RoomSide.js'
import { REACTIONS, LIMITS } from '../../shared/constants.js'
import { systemText } from '../../shared/messages.js'
import { graphemeLength } from '../../shared/text.js'

/** Vrai quand le fil est lu en bas (sert à faire avancer le curseur de lecture). */
export const atBottom = signal(true)
export const listCollapsed = signal(false)

const GROUP_MS = 5 * 60 * 1000

export function RoomScreen({ rid }) {
  useEffect(() => {
    openRoom(rid)
  }, [rid])
  const r = room.value
  if (!r || r.rid !== rid || r.loading) {
    return html`<div class="fill-center"><${Shiba} body wag size=${100} label="Chargement du salon" /></div>`
  }
  if (r.removed) {
    return html`<div class="fill-center"><${EmptyState} mood="triste" title="Tu ne fais plus partie de ce salon"
      text="L’hôte t’a retiré du salon, ou tu l’as quitté depuis un autre appareil.">
      <button class="btn btn-primary" onClick=${() => navigate(paths.home())}>Retour à mes salons</button>
    </${EmptyState}></div>`
  }
  if (r.error) {
    const gone = r.error.code === 'not_member' || r.error.code === 'room_not_found'
    return html`<div class="fill-center">${gone
      ? html`<${EmptyState} mood="triste" title="Salon introuvable" text=${r.error.message}>
          <button class="btn btn-primary" onClick=${() => navigate(paths.home())}>Retour à mes salons</button></${EmptyState}>`
      : html`<${ErrorState} error=${r.error} onRetry=${() => {
          room.value = null
          openRoom(rid)
        }} />`}</div>`
  }
  return html`<section class="room-screen" aria-label=${`Salon ${r.info.name}`}>
    <${RoomHeader} r=${r} />
    <${GameBanner} r=${r} />
    <${Thread} r=${r} />
    <${Composer} r=${r} />
  </section>`
}

function RoomHeader({ r }) {
  const lay = layout.value
  const online = Object.values(r.presence || {}).filter((ts) => serverNow() - ts < LIMITS.presenceMs).length
  return html`<header class="screen-header">
    ${lay === 'mobile' && html`<button class="icon-btn" onClick=${() => back(paths.home())} aria-label="Retour à mes salons"><${Icon} name="back" /></button>`}
    ${lay === 'tablet' &&
    html`<button class="icon-btn" aria-pressed=${String(!listCollapsed.value)} onClick=${() => (listCollapsed.value = !listCollapsed.value)}
      aria-label=${listCollapsed.value ? 'Afficher la liste des salons' : 'Replier la liste des salons'}><${Icon} name="sidebar" /></button>`}
    <button class="titles" style=${{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, minHeight: '44px' }}
      onClick=${() => openModal('roomInfo')} aria-label=${`Infos du salon ${r.info.name}`}>
      <h1 class="ellipsis">${r.info.name}</h1>
      <span class="subtitle"><span class="dot on" aria-hidden="true"></span> ${plural(r.members.length, 'membre', 'membres')} · ${online} en ligne</span>
    </button>
    ${lay !== 'desktop' &&
    html`<button class="icon-btn" onClick=${() => openModal('members')} aria-label="Membres du salon"><${Icon} name="users" /></button>
      <button class="icon-btn" onClick=${() => openModal('leaderboard')} aria-label="Classement du salon"><${Icon} name="trophy" /></button>`}
    <button class="icon-btn" onClick=${() => openModal('roomMenu')} aria-label="Options du salon"><${Icon} name="dots" /></button>
  </header>`
}

function GameBanner({ r }) {
  const g = r.game
  if (!g || (g.status !== 'lobby' && g.status !== 'playing')) return null
  const mine = g.players.some((p) => p.id === me.value.id)
  const go = () => navigate(paths.game(r.rid, g.id))
  const join = async () => {
    try {
      await joinGameById(g.id)
      go()
    } catch (err) {
      errorToast(err)
    }
  }
  return html`<div class="game-banner" role="status">
    <${Icon} name="gamepad" />
    <span class="grow">${g.status === 'playing' ? 'Partie de Draw It en cours' : 'Lobby Draw It ouvert'} · ${g.players.length} joueur${g.players.length > 1 ? 's' : ''}</span>
    ${mine
      ? html`<button class="btn btn-small btn-primary" onClick=${go}>Retourner à la partie</button>`
      : html`<button class="btn btn-small btn-primary" onClick=${join}>Rejoindre</button>`}
  </div>`
}

function joinGameById(gid) {
  return api.post(`games/${gid}/join`)
}

function Thread({ r }) {
  const ref = useRef(null)
  const topRef = useRef(null)
  const firstRender = useRef(true)
  const prevCount = useRef(0)
  const prevHeight = useRef(0)
  const prevOldest = useRef(null)
  const [showJump, setShowJump] = useState(false)
  const myId = me.value.id
  const msgs = r.messages

  // Séparateur « Nouveaux messages » : premier message non lu à l'ouverture du salon.
  const separatorId = r.separatorId

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottom.value = bottom
    if (bottom) setShowJump(false)
  }

  // Défilement : bas du fil à l'ouverture (ou séparateur « Nouveaux messages »), conservation de la position
  // quand on charge l'historique, suivi automatique si on était déjà en bas.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const oldest = msgs[0]?.id
    if (firstRender.current) {
      firstRender.current = false
      const sep = separatorId && el.querySelector('.new-sep')
      if (sep) el.scrollTop = sep.offsetTop - 80
      else el.scrollTop = el.scrollHeight
      atBottom.value = !sep
    } else if (prevOldest.current && oldest !== prevOldest.current && msgs.length > prevCount.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop
    } else if (msgs.length > prevCount.current) {
      const last = msgs.at(-1)
      if (atBottom.value || last?.author === myId) el.scrollTop = el.scrollHeight
      else setShowJump(true)
    }
    prevCount.current = msgs.length
    prevHeight.current = el.scrollHeight
    prevOldest.current = oldest
  }, [msgs.length, msgs[0]?.id])

  // Historique : on charge les messages précédents en remontant le fil.
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        prevHeight.current = ref.current.scrollHeight
        loadOlder()
      }
    }, { root: ref.current, rootMargin: '200px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [r.hasMore])

  useEffect(() => () => (atBottom.value = true), [])

  const items = []
  let group = null
  let prev = null
  for (const m of msgs) {
    if (!prev || !sameDay(prev.ts, m.ts)) items.push(html`<div class="day-sep" key=${`d${m.id}`}>${dayLabel(m.ts)}</div>`)
    if (m.id === separatorId) {
      items.push(html`<div class="new-sep" key="sep" role="separator"><span>Nouveaux messages</span></div>`)
      group = null
    }
    if (m.type === 'text') {
      const sameGroup = group && group.author === m.author && m.ts - group.last < GROUP_MS && prev?.type === 'text' && sameDay(prev.ts, m.ts) && m.id !== separatorId
      if (sameGroup) {
        group.msgs.push(m)
        group.last = m.ts
      } else {
        group = { author: m.author, msgs: [m], last: m.ts, key: m.id }
        items.push(group)
      }
    } else {
      group = null
      items.push(m.type === 'sys' ? html`<${SystemMessage} key=${m.id} m=${m} />` : html`<${GameCard} key=${m.id} m=${m} r=${r} />`)
    }
    prev = m
  }

  const jump = () => {
    ref.current.scrollTop = ref.current.scrollHeight
    setShowJump(false)
  }

  return html`<div class="thread" ref=${ref} onScroll=${onScroll} role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Messages">
    <div class="thread-inner">
      <div class="thread-top" ref=${topRef}>
        ${r.loadingOlder
          ? html`<${Shiba} body wag size=${44} label="Chargement des messages précédents" />`
          : r.hasMore
            ? html`<button class="btn btn-small btn-ghost" onClick=${() => loadOlder()}>Messages précédents</button>`
            : html`<p class="tiny muted">Début du salon « ${r.info.name} »</p>`}
      </div>
      ${items.map((it) => (it.msgs ? html`<${MessageGroup} key=${it.key} g=${it} r=${r} />` : it))}
    </div>
    ${showJump && html`<button class="btn btn-small btn-lavender jump-new" onClick=${jump}><${Icon} name="arrowDown" size=${18} /> Nouveaux messages</button>`}
  </div>`
}

function SystemMessage({ m }) {
  return html`<div class=${`sys-msg ${m.sys?.kind === 'weekly' ? 'weekly' : ''}`}>
    <${Icon} name=${m.sys?.kind === 'weekly' ? 'trophy' : m.sys?.kind === 'rename' ? 'edit' : m.sys?.kind === 'host' ? 'crown' : 'chat'} size=${18} />
    <span>${systemText(m.sys)}</span>
  </div>`
}

function MessageGroup({ g, r }) {
  const myId = me.value.id
  const mine = g.author === myId
  const first = g.msgs[0]
  const member = r.members.find((x) => x.id === g.author)
  const author = member || { id: g.author, pseudo: first.a?.p || 'Shiba', coat: first.a?.c || 'creme', acc: first.a?.x || [] }
  return html`<div class=${`msg-group ${mine ? 'mine' : ''}`}>
    ${!mine && html`<div class="msg-avatar"><${Avatar} user=${author} size=${36} /></div>`}
    <div class="msg-stack">
      ${!mine && html`<div class="msg-author"><span>${author.pseudo}</span></div>`}
      ${g.msgs.map((m, i) => html`<${Message} key=${m.id} m=${m} r=${r} mine=${mine} last=${i === g.msgs.length - 1} />`)}
    </div>
  </div>`
}

const picker = signal(null)

function Message({ m, r, mine, last }) {
  const pressTimer = useRef(null)
  const reactions = r.reactions[m.id] || {}
  const entries = REACTIONS.filter((x) => reactions[x.id]?.length)
  const myId = me.value.id
  const emoji = isEmojiOnly(m.text)
  const openPicker = (target) => {
    if (m.local) return
    const rect = target.getBoundingClientRect()
    picker.value = { msgId: m.id, x: rect.left + rect.width / 2, y: rect.top }
  }
  const onTouchStart = (e) => {
    const target = e.currentTarget
    pressTimer.current = setTimeout(() => openPicker(target), 480)
  }
  const cancelPress = () => clearTimeout(pressTimer.current)
  return html`<div class=${`msg ${m.pending ? 'pending' : ''} ${m.failed ? 'failed' : ''}`}>
    <div class=${`bubble ${emoji ? 'emoji-only' : ''}`} onTouchStart=${onTouchStart} onTouchEnd=${cancelPress} onTouchMove=${cancelPress}
      onContextMenu=${(e) => {
        if (!finePointer.value) {
          e.preventDefault()
          openPicker(e.currentTarget)
        }
      }}>${m.text}</div>
    ${!m.local &&
    html`<div class="msg-tools">
      <button class="icon-btn" aria-label="Réagir à ce message" onClick=${(e) => openPicker(e.currentTarget)}><${Icon} name="smile" size=${20} /></button>
    </div>`}
    ${entries.length > 0 &&
    html`<div class="reactions">
      ${entries.map((x) => {
        const list = reactions[x.id]
        const minePick = list.includes(myId)
        return html`<button class=${`reaction ${minePick ? 'mine' : ''}`} onClick=${() => toggleReaction(m.id, x.id)}
          aria-pressed=${String(minePick)} aria-label=${`${x.label} : ${list.length}`} title=${x.label}>
          <${ReactionIcon} id=${x.id} size=${24} /> ${list.length}
        </button>`
      })}
    </div>`}
    ${m.pending && html`<div class="msg-meta">En cours d’envoi…</div>`}
    ${m.failed &&
    html`<div class="msg-meta" role="alert">
      <${Icon} name="alert" size=${14} /> ${m.error || 'Échec de l’envoi'}
      <button class="link-btn" style=${{ padding: '0 6px' }} onClick=${() => retryMessage(m.id)}>Réessayer</button>
      <button class="link-btn" style=${{ padding: '0 6px' }} onClick=${() => discardMessage(m.id)}>Supprimer</button>
    </div>`}
    ${last && !m.pending && !m.failed && html`<div class="msg-meta">${hhmm(m.ts)}</div>`}
  </div>`
}

/** Sélecteur des six réactions illustrées. */
export function ReactionPicker() {
  const p = picker.value
  useEffect(() => {
    if (!p) return
    const close = (e) => {
      if (!e.target.closest?.('.reaction-popover')) picker.value = null
    }
    const esc = (e) => e.key === 'Escape' && (picker.value = null)
    setTimeout(() => document.addEventListener('pointerdown', close), 0)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [p])
  if (!p) return null
  const width = 6 * 52 + 16
  const left = Math.max(8, Math.min(innerWidth - width - 8, p.x - width / 2))
  const top = Math.max(8, p.y - 70)
  return html`<div class="reaction-popover" style=${{ left: `${left}px`, top: `${top}px` }}>
    <div class="reaction-picker" role="menu" aria-label="Réactions">
      ${REACTIONS.map(
        (x, i) => html`<button role="menuitem" autofocus=${i === 0} aria-label=${x.label} title=${x.label}
          onClick=${() => {
            toggleReaction(p.msgId, x.id)
            picker.value = null
          }}><${ReactionIcon} id=${x.id} size=${40} /></button>`,
      )}
    </div>
  </div>`
}

function Composer({ r }) {
  const [text, setText] = useState('')
  const ta = useRef(null)
  const now = useNow(500)
  const slow = slowUntil.value > now
  const count = graphemeLength(text)
  const resize = () => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(140, el.scrollHeight)}px`
  }
  useLayoutEffect(resize, [text])
  const submit = () => {
    if (!text.trim()) return
    if (count > LIMITS.messageMax) return toast('500 caractères au plus par message.', 'error')
    if (!canSendNow()) return
    if (sendMessage(text)) {
      setText('')
      ta.current?.focus()
    }
  }
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && finePointer.value && !e.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  return html`<div>
    ${slow && html`<div class="slowdown" role="alert"><${Icon} name="hourglass" size=${18} /> Doucement ! Attends ${Math.ceil((slowUntil.value - now) / 1000)} s avant d’envoyer un nouveau message.</div>`}
    <div class="composer">
      <div class="composer-field">
        <label for="composer" class="sr-only">Écrire un message</label>
        <textarea id="composer" ref=${ta} rows="1" value=${text} placeholder="Écris à la meute…" maxlength="2000"
          onInput=${(e) => setText(e.currentTarget.value)} onKeyDown=${onKey} enterkeyhint="send"></textarea>
        ${count > 400 && html`<span class=${`count ${count > LIMITS.messageMax ? 'over' : ''}`} aria-live="polite">${count}/500</span>`}
        <button class="send-btn" onClick=${submit} disabled=${!text.trim() || slow} aria-label="Envoyer"><${Icon} name="send" size=${22} /></button>
      </div>
      <button class="btn btn-lavender play-btn" onClick=${() => navigate(paths.hub(r.rid))}><${Icon} name="gamepad" /> Jouer</button>
    </div>
  </div>`
}

// ---------- Fenêtres du salon ----------

export function RoomInfoSheet() {
  const r = room.value
  if (!r?.info) return null
  return html`<${Sheet} title=${r.info.name} onClose=${closeModal}>
    <${InviteBox} r=${r} />
    <h3 class="section-title"><${Icon} name="users" size=${20} /> Membres</h3>
    <${MembersPanel} />
  </${Sheet}>`
}

export function MembersSheet() {
  return html`<${Sheet} title="Membres" onClose=${closeModal} drawer><${MembersPanel} withInvite /></${Sheet}>`
}

export function LeaderboardSheet() {
  return html`<${Sheet} title="Classement du salon" onClose=${closeModal} drawer><${LeaderboardPanel} /></${Sheet}>`
}

export function InviteSheet({ first }) {
  const r = room.value
  if (!r?.info) return null
  return html`<${Sheet} title=${first ? 'Salon créé ! Invite ta meute' : 'Inviter des amis'} onClose=${closeModal}>
    <${InviteBox} r=${r} />
  </${Sheet}>`
}

export function RoomMenuSheet() {
  const r = room.value
  if (!r?.info) return null
  const isHost = r.info.hostId === me.value.id
  return html`<${Sheet} title="Options du salon" onClose=${closeModal}>
    <div class="col">
      <button class="btn btn-secondary btn-block" onClick=${() => openModal('invite')}><${Icon} name="link" /> Inviter des amis</button>
      ${layout.value !== 'desktop' &&
      html`<button class="btn btn-secondary btn-block" onClick=${() => openModal('members')}><${Icon} name="users" /> Membres</button>
        <button class="btn btn-secondary btn-block" onClick=${() => openModal('leaderboard')}><${Icon} name="trophy" /> Classement</button>`}
      ${isHost && html`<button class="btn btn-secondary btn-block" onClick=${() => openModal('rename')}><${Icon} name="edit" /> Renommer le salon</button>`}
      <button class="btn btn-danger btn-block" onClick=${() =>
        openModal('confirm', {
          title: 'Quitter le salon ?',
          text: isHost ? 'Tu es l’hôte : le membre le plus ancien prendra le relais.' : 'Tu pourras revenir avec un nouveau lien d’invitation.',
          confirm: 'Quitter',
          danger: true,
          onConfirm: async () => {
            await leaveRoom(r.rid).catch((e) => {
              errorToast(e)
              throw e
            })
            navigate(paths.home(), { replace: true })
          },
        })}><${Icon} name="door" /> Quitter le salon</button>
    </div>
  </${Sheet}>`
}

export function RenameSheet() {
  const r = room.value
  const [name, setName] = useState(r?.info?.name || '')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await renameRoom(name.trim())
      closeModal()
    } catch (err) {
      setError(err.message)
    }
  }
  return html`<${Sheet} title="Renommer le salon" onClose=${closeModal}>
    <form class="col" style=${{ gap: '16px' }} onSubmit=${submit}>
      <div class="field">
        <label for="rename">Nouveau nom</label>
        <input id="rename" class="input" value=${name} maxlength="40" autofocus onInput=${(e) => setName(e.currentTarget.value)} />
      </div>
      ${error && html`<p class="field-error" role="alert">${error}</p>`}
      <button class="btn btn-primary btn-block">Renommer</button>
    </form>
  </${Sheet}>`
}

export { ConfirmSheet }
