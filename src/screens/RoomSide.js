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
import { t, tn } from '../i18n/index.js'
import { weekLabel, rankName } from '../i18n/texts.js'
import { copyText } from '../components/ui.js'
import { paths, absoluteUrl } from '../lib/router.js'
import { resetInvite } from '../state/rooms.js'

export const sideTab = signal('members')

export function RoomSide() {
  return html`<div class="side">
    <div class="side-tabs" role="tablist" aria-label=${t('room.infoShort')}>
      <button role="tab" aria-selected=${String(sideTab.value === 'members')} onClick=${() => (sideTab.value = 'members')}>${t('room.membersTitle')}</button>
      <button role="tab" aria-selected=${String(sideTab.value === 'board')} onClick=${() => (sideTab.value = 'board')}>${t('room.leaderboardShort')}</button>
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
      title: t('members.kickTitle', { pseudo: m.pseudo }),
      text: t('members.kickText', { pseudo: m.pseudo, id: m.id }),
      confirm: t('members.kick'),
      danger: true,
      onConfirm: async () => {
        await kickMember(m.id).catch((e) => {
          errorToast(e)
          throw e
        })
        toast(t('members.kicked', { pseudo: m.pseudo }), 'success')
      },
    })
  return html`<div class="col" style=${{ gap: '12px' }}>
    <ul class="member-list">
      ${members.map((m) => {
        const on = online(m.id)
        return html`<li class="member" key=${m.id}>
          <${Avatar} user=${m} size=${40} label=${m.pseudo} />
          <div class="info">
            <div class="name"><span class="ellipsis">${m.pseudo}</span>${m.id === myId && html`<span class="pill white">${t('common.youShort')}</span>`}
              ${m.host && html`<span class="pill butter" title=${t('members.hostTitle')}><${Icon} name="crown" size=${14} /> ${t('members.host')}</span>`}</div>
            <div class="meta">
              <span class=${`dot ${on ? 'on' : 'off'}`} aria-hidden="true"></span><span>${on ? t('members.online') : t('members.offline')}</span>
              <span>· ${t('common.levelShort', { n: m.level })} ${rankName(m.level)}</span><span>· ${m.id}</span>
            </div>
          </div>
          ${isHost && m.id !== myId && html`<button class="btn btn-ghost btn-small" onClick=${() => kick(m)} aria-label=${t('members.kickAria', { pseudo: m.pseudo })}>${t('members.kick')}</button>`}
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
    <div class="segmented" role="group" aria-label=${t('board.period')} style=${{ alignSelf: 'center' }}>
      <button aria-pressed=${String(scope === 'week')} onClick=${() => setScope('week')}>${t('board.week')}</button>
      <button aria-pressed=${String(scope === 'all')} onClick=${() => setScope('all')}>${t('board.all')}</button>
    </div>
    ${scope === 'week' && board && html`<p class="small muted center">${t('board.weekText', { week: weekLabel(board.week) })}</p>`}
    ${error && html`<p class="field-error">${t('err.generic')}</p>`}
    ${!board && !error && html`<div class="fill-center"><${Shiba} body wag size=${60} /></div>`}
    ${board &&
    (board.entries.length === 0
      ? html`<div class="empty" style=${{ padding: '16px' }}><${Shiba} mood="concentre" size=${80} /><p>${scope === 'week' ? t('board.emptyWeek') : t('board.emptyAll')}</p></div>`
      : html`<ol class="board-list">
          ${board.entries.map(
            (e) => html`<li class=${`board-row ${e.uid === myId ? 'me' : ''}`} key=${e.uid}>
              <span class="rank" aria-label=${t('board.rankAria', { n: e.rank })}>${e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
              <${Avatar} user=${{ ...e, id: e.uid }} size=${36} label=${e.pseudo} />
              <div class="info"><div class="name ellipsis">${e.pseudo}</div><div class="meta">${t('common.levelShort', { n: e.level || 1 })}</div></div>
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
      await navigator.share({ title: t('invite.shareTitle', { name: r.info.name }), text: t('invite.shareText', { code: r.info.invite }), url: link })
    } catch {
      /* partage annulé */
    }
  }
  return html`<div class="invite-box">
    <p class="small">${t('invite.text')}</p>
    <div class="invite-code" aria-label=${t('invite.codeAria', { code: r.info.invite.split('').join(' ') })}>${r.info.invite}</div>
    <div class="invite-link">${link}</div>
    <div class="row wrap">
      <button class="btn btn-primary btn-small grow" onClick=${() => copyText(link, t('invite.copied'))}><${Icon} name="copy" /> ${t('invite.copy')}</button>
      ${navigator.share && html`<button class="btn btn-secondary btn-small" onClick=${share}><${Icon} name="share" /> ${t('invite.share')}</button>`}
    </div>
    ${isHost &&
    html`<button class="btn btn-ghost btn-small" onClick=${() =>
      openModal('confirm', {
        title: t('invite.resetTitle'),
        text: t('invite.resetText'),
        confirm: t('invite.resetConfirm'),
        onConfirm: async () => {
          await resetInvite().catch((e) => {
            errorToast(e)
            throw e
          })
          toast(t('invite.resetDone'), 'success')
        },
      })}><${Icon} name="refresh" /> ${t('invite.reset')}</button>`}
  </div>`
}
