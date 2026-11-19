// Colonne de droite du salon : membres (présence, hôte) et classement (semaine / depuis toujours).
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { Avatar, Shiba } from '../components/Shiba.js'
import { room, fetchLeaderboard, kickMember } from '../state/rooms.js'
import { me, openModal, errorToast, toast } from '../state/core.js'
import { serverNow } from '../lib/clock.js'
import { LIMITS } from '../../shared/constants.js'
import { rankFor } from '../../shared/progression.js'
import { copyText } from '../components/ui.js'
import { paths, absoluteUrl } from '../lib/router.js'
import { resetInvite } from '../state/rooms.js'

export const sideTab = signal('members')

export function RoomSide() {
  return html`<div class="side">
    <div class="side-tabs" role="tablist" aria-label="Infos du salon">
      <button role="tab" aria-selected=${String(sideTab.value === 'members')} onClick=${() => (sideTab.value = 'members')}>Membres</button>
      <button role="tab" aria-selected=${String(sideTab.value === 'board')} onClick=${() => (sideTab.value = 'board')}>Classement</button>
    </div>
    <div class="side-body" role="tabpanel">${sideTab.value === 'members' ? html`<${MembersPanel} withInvite />` : html`<${LeaderboardPanel} />`}</div>
  </div>`
}

export function MembersPanel({ withInvite = false }) {
  const r = room.value
  if (!r?.info) return null
  const myId = me.value.id
  const isHost = r.info.hostId === myId
  const now = serverNow()
  const online = (id) => id === myId || now - (r.presence?.[id] || 0) < LIMITS.presenceMs
  const members = [...r.members].sort((a, b) => Number(online(b.id)) - Number(online(a.id)) || a.pseudo.localeCompare(b.pseudo, 'fr'))
  const kick = (m) =>
    openModal('confirm', {
      title: `Retirer ${m.pseudo} ?`,
      text: `${m.pseudo} (${m.id}) ne verra plus ce salon. Réinitialise l’invitation si tu ne veux pas qu’il revienne.`,
      confirm: 'Retirer',
      danger: true,
      onConfirm: async () => {
        await kickMember(m.id).catch((e) => {
          errorToast(e)
          throw e
        })
        toast(`${m.pseudo} a été retiré du salon.`, 'success')
      },
    })
  return html`<div class="col" style=${{ gap: '12px' }}>
    <ul class="member-list">
      ${members.map((m) => {
        const on = online(m.id)
        return html`<li class="member" key=${m.id}>
          <${Avatar} user=${m} size=${40} />
          <div class="info">
            <div class="name"><span class="ellipsis">${m.pseudo}</span>${m.id === myId && html`<span class="pill white">toi</span>`}
              ${m.host && html`<span class="pill butter" title="Hôte du salon"><${Icon} name="crown" size=${14} /> Hôte</span>`}</div>
            <div class="meta">
              <span class=${`dot ${on ? 'on' : 'off'}`} aria-hidden="true"></span><span>${on ? 'en ligne' : 'hors ligne'}</span>
              <span>· Niv. ${m.level} ${rankFor(m.level)}</span><span>· ${m.id}</span>
            </div>
          </div>
          ${isHost && m.id !== myId && html`<button class="btn btn-ghost btn-small" onClick=${() => kick(m)} aria-label=${`Retirer ${m.pseudo} du salon`}>Retirer</button>`}
        </li>`
      })}
    </ul>
    ${withInvite && html`<${InviteBox} r=${r} />`}
  </div>`
}

export function LeaderboardPanel() {
  const r = room.value
  const [scope, setScope] = useState('week')
  const [board, setBoard] = useState(null)
  const [error, setError] = useState(null)
  const lastGame = r?.messages?.filter((m) => m.kind === 'results').at(-1)?.id
  useEffect(() => {
    if (!r?.rid) return
    let alive = true
    setError(null)
    fetchLeaderboard(r.rid, scope)
      .then((b) => alive && setBoard(b))
      .catch((e) => alive && setError(e))
    return () => (alive = false)
  }, [r?.rid, scope, lastGame])
  const myId = me.value.id
  return html`<div class="col" style=${{ gap: '12px' }}>
    <div class="segmented" role="group" aria-label="Période du classement" style=${{ alignSelf: 'center' }}>
      <button aria-pressed=${String(scope === 'week')} onClick=${() => setScope('week')}>Cette semaine</button>
      <button aria-pressed=${String(scope === 'all')} onClick=${() => setScope('all')}>Depuis toujours</button>
    </div>
    ${scope === 'week' && board && html`<p class="small muted center">XP gagnée dans ce salon ${board.label}.</p>`}
    ${error && html`<p class="field-error">${error.message}</p>`}
    ${!board && !error && html`<div class="fill-center"><${Shiba} body wag size=${60} /></div>`}
    ${board &&
    (board.entries.length === 0
      ? html`<div class="empty" style=${{ padding: '16px' }}><${Shiba} mood="concentre" size=${80} /><p>Personne n’a encore marqué d’XP ${scope === 'week' ? 'cette semaine' : 'ici'}. Lance une partie !</p></div>`
      : html`<ol class="board-list">
          ${board.entries.map(
            (e) => html`<li class=${`board-row ${e.uid === myId ? 'me' : ''}`} key=${e.uid}>
              <span class="rank" aria-label=${`${e.rank}e`}>${e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
              <${Avatar} user=${e} size=${36} />
              <div class="info"><div class="name ellipsis">${e.pseudo}</div><div class="meta">Niv. ${e.level || 1}</div></div>
              <span class="xp">${e.xp} XP</span>
            </li>`,
          )}
        </ol>`)}
  </div>`
}

export function InviteBox({ r }) {
  const isHost = r.info.hostId === me.value.id
  const link = absoluteUrl(paths.join(r.info.invite))
  const share = async () => {
    try {
      await navigator.share({ title: `Rejoins « ${r.info.name} » sur Weplay Shibax`, text: `Viens jouer avec nous ! Code : ${r.info.invite}`, url: link })
    } catch {
      /* partage annulé */
    }
  }
  return html`<div class="invite-box">
    <p class="small">Partage ce lien, ou donne le code à saisir dans « Rejoindre avec un code ».</p>
    <div class="invite-code" aria-label=${`Code d’invitation ${r.info.invite.split('').join(' ')}`}>${r.info.invite}</div>
    <div class="invite-link">${link}</div>
    <div class="row wrap">
      <button class="btn btn-primary btn-small grow" onClick=${() => copyText(link, 'Lien copié !')}><${Icon} name="copy" /> Copier le lien</button>
      ${navigator.share && html`<button class="btn btn-secondary btn-small" onClick=${share}><${Icon} name="share" /> Partager</button>`}
    </div>
    ${isHost &&
    html`<button class="btn btn-ghost btn-small" onClick=${() =>
      openModal('confirm', {
        title: 'Réinitialiser l’invitation ?',
        text: 'L’ancien lien et l’ancien code ne fonctionneront plus (« Invitation expirée »).',
        confirm: 'Réinitialiser',
        onConfirm: async () => {
          await resetInvite().catch((e) => {
            errorToast(e)
            throw e
          })
          toast('Nouveau lien d’invitation prêt.', 'success')
        },
      })}><${Icon} name="refresh" /> Réinitialiser le lien et le code</button>`}
  </div>`
}
