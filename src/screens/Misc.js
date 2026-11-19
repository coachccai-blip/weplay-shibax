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
import { ACCESSORIES, BADGES, rankFor } from '../../shared/progression.js'
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
          // Arrivé par ce lien avant d'avoir un compte : on entre directement dans le salon.
          invitePending.value = null
          joinByCode(code)
            .then((room) => navigate(paths.room(room.id), { replace: true }))
            .catch((err) => setState({ status: 'error', message: err.message }))
        } else setState(p)
      })
      .catch((err) => alive && setState({ status: 'error', message: err.message }))
    return () => (alive = false)
  }, [code])
  const join = async () => {
    setState({ ...state, busy: true })
    try {
      const room = await joinByCode(code)
      navigate(paths.room(room.id), { replace: true })
    } catch (err) {
      setState({ status: 'error', message: err.message })
    }
  }
  const home = html`<button class="btn btn-secondary" onClick=${() => navigate(paths.home(), { replace: true })}>Mes salons</button>`
  let content
  if (state.status === 'loading') content = html`<${Shiba} body wag size=${100} label="Vérification de l’invitation" />`
  else if (state.status === 'ok')
    content = html`<${EmptyState} mood="fete" coat="roux" title=${`Rejoindre « ${state.room.name} » ?`}
      text=${`${state.room.memberCount} membre${state.room.memberCount > 1 ? 's' : ''} t’attend${state.room.memberCount > 1 ? 'ent' : ''} pour discuter et jouer.`}>
      <button class="btn btn-primary btn-big" onClick=${join} disabled=${state.busy}>Rejoindre le salon</button>${home}</${EmptyState}>`
  else if (state.status === 'full')
    content = html`<${EmptyState} mood="triste" title="Salon complet" text=${`« ${state.room.name} » compte déjà ${LIMITS.roomMaxMembers} membres.`}>${home}</${EmptyState}>`
  else if (state.status === 'expired')
    content = html`<${EmptyState} mood="triste" title="Invitation expirée" text="Ce lien a été réinitialisé par l’hôte. Demande-lui un nouveau lien.">${home}</${EmptyState}>`
  else content = html`<${EmptyState} mood="surpris" title="Invitation introuvable" text=${state.message || 'Ce code d’invitation n’existe pas.'}>${home}</${EmptyState}>`
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
      .catch((err) => setError(err.message))
  }, [token])
  return html`<main class="screen"><div class="fill-center">
    ${error
      ? html`<${EmptyState} mood="triste" title="Connexion impossible" text=${error}>
          <button class="btn btn-primary" onClick=${() => {
            initApp()
            navigate(paths.home(), { replace: true })
          }}>Continuer</button></${EmptyState}>`
      : html`<${Shiba} body wag size=${110} label="Connexion en cours" /><p class="muted">Connexion à ton compte…</p>`}
  </div></main>`
}

export function Privacy() {
  return html`<section class="screen" aria-labelledby="privacy-title">
    <header class="screen-header">
      <button class="icon-btn" onClick=${() => back(paths.home())} aria-label="Retour"><${Icon} name="back" /></button>
      <div class="titles"><h1 id="privacy-title">Confidentialité</h1></div>
    </header>
    <div class="screen-body"><div class="privacy card">
      <p>Weplay Shibax est conçu pour collecter le moins de données possible.</p>
      <h2>Ce que l’on ne collecte pas</h2>
      <ul><li>Ni e-mail, ni nom réel, ni numéro de téléphone.</li><li>Aucun cookie publicitaire, aucun traceur tiers.</li></ul>
      <h2>Ce qui est enregistré</h2>
      <ul>
        <li>Ton identifiant (SHX-…), ton pseudo, ton shiba et ta progression (XP, badges, série).</li>
        <li>Ta clé de connexion, uniquement sous forme hachée : personne ne peut la relire.</li>
        <li>Les messages de tes salons, conservés 90 jours.</li>
        <li>Les dessins des parties, conservés 30 jours.</li>
      </ul>
      <h2>Où et pourquoi</h2>
      <p>Les données sont stockées chez Netlify (Netlify Blobs), uniquement pour faire fonctionner l’application : salons, parties et classements.</p>
      <h2>Tes droits</h2>
      <p>Tu peux modifier ton pseudo à tout moment, quitter un salon, et te déconnecter de chaque appareil. L’hôte d’un salon peut retirer un membre.</p>
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
    const acc = (item.accessories || []).map((id) => ACCESSORIES.find((a) => a.id === id)).filter(Boolean)
    return html`<div class="celebration" role="dialog" aria-modal="true" aria-label=${`Niveau ${item.level} atteint`} onClick=${close}>
      <div class="celebration-card">
        <p class="title-font" style=${{ fontSize: '1.4rem' }}>Niveau supérieur !</p>
        <span class="big-level">${item.level}</span>
        <${Shiba} body mood="fete" coat=${me.value?.coat} acc=${acc.map((a) => a.id).concat(me.value?.acc || [])} size=${150} />
        <p><b>${rankFor(item.level)}</b></p>
        ${acc.length > 0 && html`<p class="pill butter" style=${{ padding: '6px 14px' }}>Accessoire débloqué : ${acc.map((a) => a.name).join(', ')} !</p>`}
        <button class="btn btn-primary" autofocus onClick=${close}>Trop bien !</button>
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
  return html`<div class="celebration" role="dialog" aria-modal="true" aria-label=${`Badge obtenu : ${group.map((b) => b.name).join(', ')}`} onClick=${closeAll}>
    <div class="celebration-card" style=${{ maxWidth: '760px' }}>
      <p class="title-font" style=${{ fontSize: '1.3rem' }}>${group.length > 1 ? `${group.length} badges obtenus !` : 'Badge obtenu !'}</p>
      <div class="row wrap" style=${{ justifyContent: 'center', gap: '12px' }}>
        ${group.map(
          (badge, i) => html`<div class=${`flip ${group.length > 1 ? 'small' : ''}`} key=${badge.id}><div class="flip-inner" style=${{ animationDelay: `${250 + i * 220}ms` }}>
            <div class="flip-face flip-front"><${Shiba} mood="surpris" size=${group.length > 1 ? 72 : 100} /></div>
            <div class="flip-face flip-back"><${BadgeIcon} icon=${badge.icon} size=${group.length > 1 ? 60 : 84} /><b class="title-font">${badge.name}</b><small>${badge.desc}</small></div>
          </div></div>`,
        )}
      </div>
      <button class="btn btn-primary" autofocus onClick=${closeAll}>Super !</button>
    </div>
  </div>`
}
