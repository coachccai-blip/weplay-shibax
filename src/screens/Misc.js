// Rejoindre par lien d'invitation, connexion par QR code, confidentialité, célébrations.
import { useEffect, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon, BadgeIcon } from '../components/icons.js'
import { Shiba } from '../components/Shiba.js'
import { EmptyState } from '../components/ui.js'
import { previewInvite, joinByCode } from '../state/rooms.js'
import { redeemLink, celebrations, shiftCelebration, celebrateNow, me, initApp } from '../state/core.js'
import { invitePending } from '../state/invite.js'
import { navigate, back, paths } from '../lib/router.js'
import { t, tn, errorText } from '../i18n/index.js'
import { rankName, accName, badgeName, badgeDesc } from '../i18n/texts.js'
import { ACCESSORIES, BADGES } from '../../shared/progression.js'
import { LIMITS } from '../../shared/constants.js'

export function JoinScreen({ code }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    let alive = true
    previewInvite(code)
      .then((p) => {
        if (!alive) return
        if (p.status === 'member') navigate(paths.room(p.room.id), { replace: true })
        else if (p.status === 'ok' && invitePending.value?.code === code) {
          // Arrivé par ce lien avant d'avoir un compte : on entre directement dans le groupe.
          invitePending.value = null
          joinByCode(code)
            .then((room) => navigate(paths.room(room.id), { replace: true }))
            .catch((err) => setState({ status: 'error', message: errorText(err) }))
        } else setState(p)
      })
      .catch((err) => alive && setState({ status: 'error', message: errorText(err) }))
    return () => (alive = false)
  }, [code])
  const join = async () => {
    setState({ ...state, busy: true })
    try {
      const room = await joinByCode(code)
      navigate(paths.room(room.id), { replace: true })
    } catch (err) {
      setState({ status: 'error', message: errorText(err) })
    }
  }
  const home = html`<button class="btn btn-secondary" onClick=${() => navigate(paths.home(), { replace: true })}>${t('rooms.title')}</button>`
  let content
  if (state.status === 'loading') content = html`<${Shiba} body wag size=${100} label=${t('join.checking')} />`
  else if (state.status === 'ok')
    content = html`<${EmptyState} mood="fete" coat="roux" title=${t('join.title', { name: state.room.name })} text=${tn('join.text', state.room.memberCount)}>
      <button class="btn btn-primary btn-big" onClick=${join} disabled=${state.busy}>${t('join.button')}</button>${home}</${EmptyState}>`
  else if (state.status === 'full')
    content = html`<${EmptyState} mood="triste" title=${t('join.fullTitle')} text=${t('join.fullText', { name: state.room.name, max: LIMITS.roomMaxMembers })}>${home}</${EmptyState}>`
  else if (state.status === 'expired') content = html`<${EmptyState} mood="triste" title=${t('join.expiredTitle')} text=${t('join.expiredText')}>${home}</${EmptyState}>`
  else content = html`<${EmptyState} mood="surpris" title=${t('join.notFoundTitle')} text=${state.message || t('join.notFoundText')}>${home}</${EmptyState}>`
  return html`<main class="screen"><div class="fill-center">${content}</div></main>`
}

/** Ouverture du lien du QR code : l'appareil se connecte au compte, sans saisie. */
export function LinkScreen({ token, onDone }) {
  const [error, setError] = useState(null)
  useEffect(() => {
    redeemLink(token)
      .then(() => {
        onDone?.()
        navigate(paths.home(), { replace: true })
      })
      .catch((err) => setError(errorText(err)))
  }, [token])
  return html`<main class="screen"><div class="fill-center">
    ${error
      ? html`<${EmptyState} mood="triste" title=${t('link.failed')} text=${error}>
          <button class="btn btn-primary" onClick=${() => {
            initApp()
            navigate(paths.home(), { replace: true })
          }}>${t('common.continue')}</button></${EmptyState}>`
      : html`<${Shiba} body wag size=${110} label=${t('link.connecting')} /><p class="muted">${t('link.connecting')}</p>`}
  </div></main>`
}

export function Privacy() {
  return html`<section class="screen" aria-labelledby="privacy-title">
    <header class="screen-header">
      <button class="icon-btn" onClick=${() => back(paths.home())} aria-label=${t('common.back')}><${Icon} name="back" /></button>
      <div class="titles"><h1 id="privacy-title">${t('privacy.title')}</h1></div>
    </header>
    <div class="screen-body"><div class="privacy card">
      <p>${t('privacy.intro')}</p>
      <h2>${t('privacy.notCollected')}</h2>
      <ul><li>${t('privacy.no1')}</li><li>${t('privacy.no2')}</li></ul>
      <h2>${t('privacy.stored')}</h2>
      <ul>
        <li>${t('privacy.s1')}</li>
        <li>${t('privacy.s2')}</li>
        <li>${t('privacy.s3')}</li>
        <li>${t('privacy.s4')}</li>
        <li>${t('privacy.s5')}</li>
        <li>${t('privacy.s6')}</li>
      </ul>
      <h2>${t('privacy.where')}</h2>
      <p>${t('privacy.whereText')}</p>
      <h2>${t('privacy.rights')}</h2>
      <p>${t('privacy.rightsText')}</p>
    </div></div>
  </section>`
}

/** Passage de niveau (écran plein) et badge obtenu (carte qui se retourne). */
export function Celebration() {
  const item = celebrations.value[0]
  useEffect(() => {
    if (item) celebrateNow(item)
  }, [item])
  if (!item) return null
  const close = () => shiftCelebration()
  if (item.type === 'level') {
    const acc = (item.accessories || []).filter((id) => ACCESSORIES.some((a) => a.id === id))
    return html`<div class="celebration" role="dialog" aria-modal="true" aria-label=${t('celebrate.levelAria', { n: item.level })} onClick=${close}>
      <div class="celebration-card">
        <p class="title-font" style=${{ fontSize: '1.4rem' }}>${t('celebrate.levelUp')}</p>
        <span class="big-level">${item.level}</span>
        <${Shiba} body mood="fete" coat=${me.value?.coat} acc=${acc.concat(me.value?.acc || [])} size=${150} />
        <p><b>${rankName(item.level)}</b></p>
        ${acc.length > 0 && html`<p class="pill butter" style=${{ padding: '6px 14px' }}>${t('celebrate.accUnlocked', { names: acc.map(accName).join(', ') })}</p>`}
        <button class="btn btn-primary" autofocus onClick=${close}>${t('celebrate.great')}</button>
      </div>
    </div>`
  }
  // Plusieurs badges obtenus en même temps : une seule carte par badge, révélées ensemble.
  const group = []
  for (const it of celebrations.value) {
    if (it.type !== 'badge' || group.length >= 4) break
    const b = BADGES.find((x) => x.id === it.id)
    if (b) group.push(b)
  }
  if (!group.length) {
    close()
    return null
  }
  const closeAll = () => {
    for (let i = 0; i < Math.max(1, group.length); i++) shiftCelebration()
  }
  return html`<div class="celebration" role="dialog" aria-modal="true" aria-label=${t('celebrate.badgeAria', { names: group.map((b) => badgeName(b.id)).join(', ') })} onClick=${closeAll}>
    <div class="celebration-card" style=${{ maxWidth: '760px' }}>
      <p class="title-font" style=${{ fontSize: '1.3rem' }}>${group.length > 1 ? t('celebrate.badges', { n: group.length }) : t('celebrate.badge')}</p>
      <div class="row wrap" style=${{ justifyContent: 'center', gap: '12px' }}>
        ${group.map(
          (badge, i) => html`<div class=${`flip ${group.length > 1 ? 'small' : ''}`} key=${badge.id}><div class="flip-inner" style=${{ animationDelay: `${250 + i * 220}ms` }}>
            <div class="flip-face flip-front"><${Shiba} mood="surpris" size=${group.length > 1 ? 72 : 100} /></div>
            <div class="flip-face flip-back"><${BadgeIcon} icon=${badge.icon} size=${group.length > 1 ? 60 : 84} /><b class="title-font">${badgeName(badge.id)}</b><small>${badgeDesc(badge.id)}</small></div>
          </div></div>`,
        )}
      </div>
      <button class="btn btn-primary" autofocus onClick=${closeAll}>${t('celebrate.super')}</button>
    </div>
  </div>`
}
