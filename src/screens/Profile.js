// Profil : shiba, niveau, barre d'XP, badges, série, connexion d'un autre appareil, réglages.
import { useEffect, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon, BadgeIcon } from '../components/icons.js'
import { Shiba } from '../components/Shiba.js'
import { Sheet, XpBar, Switch, Segmented, copyText } from '../components/ui.js'
import { me, session, updateMe, regenerateKey, logout, openModal, closeModal, toast, errorToast, refreshMe } from '../state/core.js'
import { api } from '../lib/transport.js'
import { navigate, back, paths, absoluteUrl } from '../lib/router.js'
import { layout, useNow } from '../lib/layout.js'
import { mmss } from '../lib/format.js'
import { qrPath } from '../lib/qr.js'
import { settings } from '../lib/fx.js'
import { COATS, ACCESSORIES, BADGES, RANKS, unlockedAccessories } from '../../shared/progression.js'
import { LIMITS } from '../../shared/constants.js'

export function Profile() {
  const u = me.value
  useEffect(() => {
    refreshMe()
  }, [])
  const [pseudo, setPseudo] = useState(u.pseudo)
  const [pseudoError, setPseudoError] = useState(null)
  const unlocked = new Set(unlockedAccessories(u.level))
  const save = async (patch, ok) => {
    try {
      await updateMe(patch)
      if (ok) toast(ok, 'success', 2000)
    } catch (err) {
      errorToast(err)
      throw err
    }
  }
  const submitPseudo = async (e) => {
    e.preventDefault()
    setPseudoError(null)
    try {
      await save({ pseudo: pseudo.trim() }, 'Pseudo mis à jour !')
    } catch (err) {
      setPseudoError(err.message)
    }
  }
  const toggleAcc = (id) => {
    const acc = ACCESSORIES.find((a) => a.id === id)
    const current = (u.acc || []).filter((x) => ACCESSORIES.find((a) => a.id === x)?.slot !== acc.slot || x === id)
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    save({ acc: next })
  }
  const earned = Object.keys(u.badges || {}).length
  return html`<section class="screen" aria-labelledby="profile-title">
    <header class="screen-header">
      ${layout.value === 'mobile' ? null : html`<button class="icon-btn" onClick=${() => back(paths.home())} aria-label="Retour"><${Icon} name="back" /></button>`}
      <div class="titles"><h1 id="profile-title">Mon profil</h1><p class="subtitle">${u.id}</p></div>
    </header>
    <div class="screen-body">
      <div class="profile">
        <section class="card profile-hero">
          <${Shiba} body coat=${u.coat} acc=${u.acc} mood="content" size=${150} label="Ton shiba" />
          <form class="row" style=${{ width: '100%', maxWidth: '360px' }} onSubmit=${submitPseudo}>
            <label for="me-pseudo" class="sr-only">Pseudo</label>
            <input id="me-pseudo" class="input" value=${pseudo} maxlength="32" onInput=${(e) => setPseudo(e.currentTarget.value)} />
            <button class="btn btn-secondary btn-small" disabled=${pseudo.trim() === u.pseudo}>OK</button>
          </form>
          ${pseudoError && html`<p class="field-error" role="alert">${pseudoError}</p>`}
          <div class="level-line">
            <span class="pill butter">Niveau ${u.levelInfo.level}</span>
            <span class="pill">${u.rank}</span>
            <span class="pill coral"><${Icon} name="flame" size=${14} /> ${u.streak ? `Série de ${u.streak} jour${u.streak > 1 ? 's' : ''}` : 'Pas de série en cours'}</span>
          </div>
          <div style=${{ width: '100%' }}>
            <${XpBar} progress=${u.levelInfo.progress} />
            <p class="tiny muted center" style=${{ marginTop: '4px' }}>${u.levelInfo.into} / ${u.levelInfo.needed} XP vers le niveau ${u.levelInfo.level + 1} · ${u.xp} XP au total</p>
          </div>
          ${!u.playedToday && html`<p class="small">Termine une partie aujourd’hui pour ${u.streak ? 'prolonger' : 'lancer'} ta série 🔥</p>`}
        </section>

        <section class="card col">
          <h2>Mon shiba</h2>
          <p class="label">Pelage</p>
          <div class="coat-picker" role="group" aria-label="Pelage">
            ${COATS.map(
              (c) => html`<button class="coat-option" aria-pressed=${String(u.coat === c.id)} onClick=${() => save({ coat: c.id })}>
                <${Shiba} coat=${c.id} size=${44} />${c.name}</button>`,
            )}
          </div>
          <p class="label">Accessoires gagnés</p>
          <div class="acc-picker" role="group" aria-label="Accessoires">
            ${ACCESSORIES.map((a) => {
              const ok = unlocked.has(a.id)
              return html`<button class="acc-option" aria-pressed=${String((u.acc || []).includes(a.id))} disabled=${!ok}
                onClick=${() => ok && toggleAcc(a.id)} aria-label=${ok ? a.name : `${a.name} : débloqué au niveau ${a.level}`}>
                <${Shiba} coat=${u.coat} acc=${[a.id]} size=${44} />
                ${ok ? a.name : html`<span class="row" style=${{ gap: '2px' }}><${Icon} name="lock" size=${12} /> Niv. ${a.level}</span>`}
              </button>`
            })}
          </div>
          <p class="tiny muted">Rangs : ${RANKS.map((r) => `${r.name} (niv. ${r.min}+)`).join(' · ')}</p>
        </section>

        <section class="card col span-2">
          <h2>Badges <span class="pill butter">${earned}/${BADGES.length}</span></h2>
          <div class="badges-grid">
            ${BADGES.map((b) => {
              const at = u.badges?.[b.id]
              return html`<div class=${`badge-card ${at ? '' : 'locked'}`} key=${b.id} aria-label=${`${b.name} : ${at ? 'obtenu' : 'pas encore obtenu'}. ${b.desc}`}>
                <${BadgeIcon} icon=${b.icon} />
                <b>${b.name}</b><small>${b.desc}</small>
                ${at ? html`<small class="pill white">Obtenu le ${new Date(at).toLocaleDateString('fr-FR')}</small>` : html`<small class="row" style=${{ gap: '2px' }}><${Icon} name="lock" size=${12} /> à débloquer</small>`}
              </div>`
            })}
          </div>
          <div class="stat-grid">
            <div class="stat"><b>${u.stats.games || 0}</b><span>parties</span></div>
            <div class="stat"><b>${u.stats.wins || 0}</b><span>victoires</span></div>
            <div class="stat"><b>${u.stats.found || 0}</b><span>mots trouvés</span></div>
            <div class="stat"><b>${u.stats.msgs || 0}</b><span>messages</span></div>
          </div>
        </section>

        <${DevicesCard} u=${u} />

        <section class="card col">
          <h2>Réglages</h2>
          <div class="switch-row">
            <span class="row"><${Icon} name=${settings.value.sound ? 'soundOn' : 'soundOff'} /> <b>Sons</b></span>
            <${Switch} label="Sons" checked=${settings.value.sound} onChange=${(v) => {
              settings.value = { ...settings.value, sound: v }
              save({ settings: { sound: v } })
            }} />
          </div>
          <div class="col" style=${{ gap: '6px' }}>
            <b>Réduire les animations</b>
            <${Segmented} label="Réduire les animations" value=${settings.value.motion} onChange=${(m) => {
              settings.value = { ...settings.value, motion: m }
              save({ settings: { motion: m } })
            }} options=${[{ value: 'system', label: 'Comme le système' }, { value: 'reduce', label: 'Oui' }, { value: 'full', label: 'Non' }]} />
          </div>
          <hr class="sep" />
          <a class="btn btn-ghost btn-small" href="#/confidentialite"><${Icon} name="shield" /> Confidentialité</a>
          <button class="btn btn-ghost btn-small" onClick=${() =>
            openModal('confirm', {
              title: 'Se déconnecter de cet appareil ?',
              text: 'Pour revenir, il te faudra ton identifiant et ta clé de connexion, ou le QR code d’un autre appareil connecté.',
              confirm: 'Me déconnecter',
              danger: true,
              onConfirm: async () => logout(),
            })}><${Icon} name="logout" /> Se déconnecter de cet appareil</button>
        </section>
      </div>
    </div>
  </section>`
}

function DevicesCard({ u }) {
  const key = session.value?.key
  const [show, setShow] = useState(false)
  return html`<section class="card col">
    <h2>Connecter un autre appareil</h2>
    <p class="small">Utilise le même compte sur ton téléphone et ton PC : salons, progression et badges sont partagés.</p>
    <button class="btn btn-primary" onClick=${() => openModal('qr')}><${Icon} name="qr" /> Afficher le QR code</button>
    <p class="label">Ou saisis ces informations dans « J’ai déjà un compte » :</p>
    <div class="secret-box"><code aria-label="Identifiant">${u.id}</code>
      <button class="icon-btn" onClick=${() => copyText(u.id, 'Identifiant copié !')} aria-label="Copier l’identifiant"><${Icon} name="copy" /></button></div>
    ${key
      ? html`<div class="secret-box">
          <code aria-label="Clé de connexion">${show ? key : '••••••••••••'}</code>
          <button class="icon-btn" onClick=${() => setShow(!show)} aria-label=${show ? 'Masquer la clé' : 'Afficher la clé'}><${Icon} name=${show ? 'eyeOff' : 'eye'} /></button>
          <button class="icon-btn" onClick=${() => copyText(key, 'Clé copiée !')} aria-label="Copier la clé"><${Icon} name="copy" /></button>
        </div>`
      : html`<p class="small muted">La clé n’est pas enregistrée sur cet appareil (connecté par QR code). Retrouve-la sur ton premier appareil, ou régénère-la.</p>`}
    <div class="warning-box"><${Icon} name="alert" /><span>Sans ta clé et sans appareil encore connecté, ton compte est perdu : note-la précieusement.</span></div>
    <button class="btn btn-ghost btn-small" onClick=${() =>
      openModal('confirm', {
        title: 'Régénérer la clé ?',
        text: 'Une nouvelle clé sera créée et tous tes autres appareils seront déconnectés.',
        confirm: 'Régénérer',
        danger: true,
        onConfirm: async () => {
          try {
            await regenerateKey()
            setShow(true)
            toast('Nouvelle clé créée. Note-la bien !', 'success')
          } catch (err) {
            errorToast(err)
            throw err
          }
        },
      })}><${Icon} name="refresh" /> Régénérer la clé</button>
  </section>`
}

/** QR code valable 10 minutes, utilisable une fois : le scanner ouvre l'appli déjà connectée. */
export function QrSheet() {
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)
  const [used, setUsed] = useState(false)
  const now = useNow(1000)
  const create = async () => {
    setError(null)
    setUsed(false)
    try {
      setLink(await api.post('me/link'))
    } catch (err) {
      setError(err.message)
    }
  }
  useEffect(() => {
    create()
  }, [])
  useEffect(() => {
    if (!link || used) return
    const t = setInterval(async () => {
      try {
        const st = await api.get(`me/link/${link.token}`)
        if (st.used) {
          setUsed(true)
          toast('Nouvel appareil connecté ! 🎉', 'success')
        }
      } catch {
        /* réessai au prochain tour */
      }
    }, 3000)
    return () => clearInterval(t)
  }, [link, used])
  const expired = link && now > link.expiresAt
  const url = link ? absoluteUrl(`/connexion/${link.token}`) : ''
  const qr = link ? qrPath(url) : null
  return html`<${Sheet} title="Connecter un autre appareil" onClose=${closeModal}>
    <div class="qr-box">
      ${error && html`<p class="field-error">${error}</p>`}
      ${used
        ? html`<${Shiba} body mood="fete" size=${120} /><h3>Appareil connecté !</h3><p class="muted">Ton autre appareil utilise maintenant ce compte.</p>`
        : !link
          ? html`<${Shiba} body wag size=${80} />`
          : expired
            ? html`<${Shiba} mood="triste" size=${90} /><p>Ce QR code a expiré.</p><button class="btn btn-primary" onClick=${create}>Nouveau QR code</button>`
            : html`<svg class="qr" viewBox=${`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code de connexion" shape-rendering="crispEdges">
                  <rect width=${qr.size} height=${qr.size} fill="#fff" /><path d=${qr.d} fill="#4A3B36" /></svg>
                <p><b>Scanne-le avec l’appareil photo de ton autre appareil.</b></p>
                <p class="small muted">Valable encore ${mmss(link.expiresAt - now)}, utilisable une seule fois.</p>
                <button class="btn btn-ghost btn-small" onClick=${() => copyText(url, 'Lien copié !')}><${Icon} name="copy" /> Copier le lien</button>`}
    </div>
  </${Sheet}>`
}

/** Rappel après la première partie : noter sa clé de connexion. */
export function KeyReminderSheet() {
  const close = () => {
    updateMe({ keyReminderShown: true }).catch(() => {})
    closeModal()
  }
  return html`<${Sheet} title="Pense à noter ta clé !" onClose=${close}>
    <div class="col" style=${{ alignItems: 'center', textAlign: 'center' }}>
      <${Shiba} body mood="wink" coat="sesame" size=${110} />
      <p>Bravo pour ta première partie ! Ta progression est liée à ton compte <b>${me.value.id}</b>.</p>
      <p class="small">Note ta clé de connexion (dans ton profil) : sans elle et sans autre appareil connecté, le compte serait perdu.</p>
      <div class="sheet-actions" style=${{ justifyContent: 'center' }}>
        <button class="btn btn-ghost" onClick=${close}>Plus tard</button>
        <button class="btn btn-primary" onClick=${() => {
          close()
          navigate(paths.profile())
        }}>Voir ma clé</button>
      </div>
    </div>
  </${Sheet}>`
}
