// Profil : photo, shiba, niveau, barre d'XP, badges, série, appareils connectés, langue, réglages.
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon, BadgeIcon } from '../components/icons.js'
import { Shiba, Avatar } from '../components/Shiba.js'
import { Sheet, XpBar, Switch, Segmented, copyText } from '../components/ui.js'
import { me, session, updateMe, regenerateKey, logout, openModal, closeModal, toast, errorToast, refreshMe, changeLang, uploadPhoto, deletePhoto } from '../state/core.js'
import { api } from '../lib/transport.js'
import { navigate, back, paths, absoluteUrl } from '../lib/router.js'
import { layout, useNow } from '../lib/layout.js'
import { mmss, ago, shortDate } from '../lib/format.js'
import { qrPath } from '../lib/qr.js'
import { settings } from '../lib/fx.js'
import { t, tn, lang, LANGS, errorText } from '../i18n/index.js'
import { rankName, coatName, accName, badgeName, badgeDesc } from '../i18n/texts.js'
import { COATS, ACCESSORIES, BADGES, RANKS, unlockedAccessories } from '../../shared/progression.js'

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
      await save({ pseudo: pseudo.trim() }, t('profile.pseudoSaved'))
    } catch (err) {
      setPseudoError(errorText(err))
    }
  }
  const toggleAcc = (id) => {
    const acc = ACCESSORIES.find((a) => a.id === id)
    const current = (u.acc || []).filter((x) => ACCESSORIES.find((a) => a.id === x)?.slot !== acc.slot || x === id)
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    save({ acc: next })
  }
  const earned = Object.keys(u.badges || {}).length
  const lv = u.levelInfo
  return html`<section class="screen" aria-labelledby="profile-title">
    <header class="screen-header">
      ${layout.value === 'mobile' ? null : html`<button class="icon-btn" onClick=${() => back(paths.home())} aria-label=${t('common.back')}><${Icon} name="back" /></button>`}
      <div class="titles"><h1 id="profile-title">${t('profile.title')}</h1><p class="subtitle">${u.id}</p></div>
    </header>
    <div class="screen-body">
      <div class="profile">
        <section class="card profile-hero">
          <div class="hero-pics">
            <${Shiba} body coat=${u.coat} acc=${u.acc} mood="content" size=${150} label=${t('profile.yourShiba')} />
            ${u.photoUrl && html`<span class="hero-photo"><${Avatar} user=${u} size=${84} label=${t('profile.yourPhoto')} /></span>`}
          </div>
          <form class="row" style=${{ width: '100%', maxWidth: '360px' }} onSubmit=${submitPseudo}>
            <label for="me-pseudo" class="sr-only">${t('common.pseudo')}</label>
            <input id="me-pseudo" class="input" value=${pseudo} maxlength="32" onInput=${(e) => setPseudo(e.currentTarget.value)} />
            <button class="btn btn-secondary btn-small" disabled=${pseudo.trim() === u.pseudo}>${t('common.ok')}</button>
          </form>
          ${pseudoError && html`<p class="field-error" role="alert">${pseudoError}</p>`}
          <div class="level-line">
            <span class="pill butter">${t('common.level', { n: lv.level })}</span>
            <span class="pill">${rankName(lv.level)}</span>
            <span class="pill coral"><${Icon} name="flame" size=${14} /> ${u.streak ? tn('profile.streak', u.streak) : t('profile.noStreak')}</span>
          </div>
          <div style=${{ width: '100%' }}>
            <${XpBar} progress=${lv.progress} />
            <p class="tiny muted center" style=${{ marginTop: '4px' }}>${t('common.xpToNext', { into: lv.into, needed: lv.needed, n: lv.level + 1 })} · ${t('profile.xpTotal', { n: u.xp })}</p>
          </div>
          ${!u.playedToday && html`<p class="small">${u.streak ? t('profile.keepStreak') : t('profile.startStreak')}</p>`}
        </section>

        <${PhotoCard} u=${u} />

        <section class="card col">
          <h2>${t('profile.myShiba')}</h2>
          <p class="label">${t('profile.coat')}</p>
          <div class="coat-picker" role="group" aria-label=${t('profile.coat')}>
            ${COATS.map(
              (c) => html`<button key=${c.id} class="coat-option" aria-pressed=${String(u.coat === c.id)} onClick=${() => save({ coat: c.id })}>
                <${Shiba} coat=${c.id} size=${44} />${coatName(c.id)}</button>`,
            )}
          </div>
          <p class="label">${t('profile.accessories')}</p>
          <div class="acc-picker" role="group" aria-label=${t('profile.accessories')}>
            ${ACCESSORIES.map((a) => {
              const ok = unlocked.has(a.id)
              return html`<button key=${a.id} class="acc-option" aria-pressed=${String((u.acc || []).includes(a.id))} disabled=${!ok}
                onClick=${() => ok && toggleAcc(a.id)} aria-label=${ok ? accName(a.id) : t('profile.accLocked', { name: accName(a.id), n: a.level })}>
                <${Shiba} coat=${u.coat} acc=${[a.id]} size=${44} />
                ${ok ? accName(a.id) : html`<span class="row" style=${{ gap: '2px' }}><${Icon} name="lock" size=${12} /> ${t('common.levelShort', { n: a.level })}</span>`}
              </button>`
            })}
          </div>
          <p class="tiny muted">${t('profile.ranks')} ${RANKS.map((r) => `${rankName(r.min)} (${t('common.levelShort', { n: r.min })}+)`).join(' · ')}</p>
        </section>

        <section class="card col span-2">
          <h2>${t('profile.badges')} <span class="pill butter">${earned}/${BADGES.length}</span></h2>
          <div class="badges-grid">
            ${BADGES.map((b) => {
              const at = u.badges?.[b.id]
              return html`<div class=${`badge-card ${at ? '' : 'locked'}`} key=${b.id} aria-label=${`${badgeName(b.id)} : ${at ? t('profile.badgeEarned') : t('profile.badgeNotYet')}. ${badgeDesc(b.id)}`}>
                <${BadgeIcon} icon=${b.icon} />
                <b>${badgeName(b.id)}</b><small>${badgeDesc(b.id)}</small>
                ${at ? html`<small class="pill white">${t('profile.badgeOn', { date: shortDate(at) })}</small>` : html`<small class="row" style=${{ gap: '2px' }}><${Icon} name="lock" size=${12} /> ${t('profile.toUnlock')}</small>`}
              </div>`
            })}
          </div>
          <div class="stat-grid">
            <div class="stat"><b>${u.stats.games || 0}</b><span>${t('profile.statGames')}</span></div>
            <div class="stat"><b>${u.stats.wins || 0}</b><span>${t('profile.statWins')}</span></div>
            <div class="stat"><b>${u.stats.found || 0}</b><span>${t('profile.statFound')}</span></div>
            <div class="stat"><b>${u.stats.msgs || 0}</b><span>${t('profile.statMsgs')}</span></div>
          </div>
        </section>

        <${DevicesCard} u=${u} />

        <section class="card col">
          <h2>${t('profile.settings')}</h2>
          <div class="col" style=${{ gap: '6px' }}>
            <b class="row"><${Icon} name="globe" /> ${t('profile.language')}</b>
            <${Segmented} label=${t('profile.language')} value=${lang.value} onChange=${(l) => changeLang(l)} options=${LANGS.map((l) => ({ value: l.id, label: l.name }))} />
            <span class="field-hint">${t('profile.languageHint')}</span>
          </div>
          <div class="switch-row">
            <span class="row"><${Icon} name=${settings.value.sound ? 'soundOn' : 'soundOff'} /> <b>${t('profile.sounds')}</b></span>
            <${Switch} label=${t('profile.sounds')} checked=${settings.value.sound} onChange=${(v) => {
              settings.value = { ...settings.value, sound: v }
              save({ settings: { sound: v } })
            }} />
          </div>
          <div class="col" style=${{ gap: '6px' }}>
            <b>${t('profile.motion')}</b>
            <${Segmented} label=${t('profile.motion')} value=${settings.value.motion} onChange=${(m) => {
              settings.value = { ...settings.value, motion: m }
              save({ settings: { motion: m } })
            }} options=${[{ value: 'system', label: t('profile.motionSystem') }, { value: 'reduce', label: t('common.yes') }, { value: 'full', label: t('common.no') }]} />
          </div>
          <hr class="sep" />
          <a class="btn btn-ghost btn-small" href="#/confidentialite"><${Icon} name="shield" /> ${t('privacy.title')}</a>
          <button class="btn btn-ghost btn-small" onClick=${() =>
            openModal('confirm', {
              title: t('profile.logoutTitle'),
              text: t('profile.logoutText'),
              confirm: t('profile.logoutConfirm'),
              danger: true,
              onConfirm: async () => logout(),
            })}><${Icon} name="logout" /> ${t('profile.logout')}</button>
        </section>
      </div>
    </div>
  </section>`
}

// ---------- Photo de profil ----------

function PhotoCard({ u }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const pick = (e) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    if (!/^image\//.test(file.type)) return toast(t('photo.notImage'), 'error')
    if (file.size > 25 * 1024 * 1024) return toast(t('photo.tooBig'), 'error')
    openModal('photo', { file })
  }
  const remove = async () => {
    setBusy(true)
    try {
      await deletePhoto()
      toast(t('photo.removed'), 'success', 2000)
    } catch (err) {
      errorToast(err)
    }
    setBusy(false)
  }
  return html`<section class="card col">
    <h2>${t('photo.title')}</h2>
    <div class="row">
      <${Avatar} user=${u} size=${72} label=${t('profile.yourPhoto')} />
      <p class="small grow">${t('photo.hint')}</p>
    </div>
    <input ref=${inputRef} type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true" onChange=${pick} />
    <div class="row wrap">
      <button class="btn btn-primary btn-small" disabled=${busy} onClick=${() => inputRef.current?.click()}><${Icon} name="camera" /> ${u.photoUrl ? t('photo.change') : t('photo.add')}</button>
      ${u.photoUrl && html`<button class="btn btn-ghost btn-small" disabled=${busy} onClick=${remove}><${Icon} name="trash" /> ${t('photo.remove')}</button>`}
    </div>
    <p class="tiny muted"><${Icon} name="shield" size=${14} /> ${t('photo.privacy')}</p>
  </section>`
}

const OUT = 320
const VIEW = 260

function encodePhoto(canvas) {
  const webp = canvas.toDataURL('image/webp', 0.86)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** Recadrage carré (glisser pour déplacer, curseur pour zoomer), puis envoi en 320 × 320. */
export function PhotoSheet({ file }) {
  const viewRef = useRef(null)
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const drag = useRef(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => {
      setImg(el)
      setCenter([el.naturalWidth / 2, el.naturalHeight / 2])
    }
    el.onerror = () => setError(t('photo.unreadable'))
    el.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const side = img ? Math.min(img.naturalWidth, img.naturalHeight) / zoom : 0
  const clampCenter = ([x, y], s = side) => {
    if (!img) return [x, y]
    const half = s / 2
    return [Math.min(Math.max(x, half), img.naturalWidth - half), Math.min(Math.max(y, half), img.naturalHeight - half)]
  }
  const draw = (canvas, size) => {
    const ctx = canvas.getContext('2d')
    const [cx, cy] = clampCenter(center)
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size)
  }
  useEffect(() => {
    if (!img || !center || !viewRef.current) return
    const c = viewRef.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = VIEW * dpr
    c.height = VIEW * dpr
    draw(c, VIEW * dpr)
  }, [img, center, zoom])

  const onDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, center: clampCenter(center) }
  }
  const onMove = (e) => {
    if (!drag.current) return
    const k = side / VIEW
    const d = drag.current
    setCenter(clampCenter([d.center[0] - (e.clientX - d.x) * k, d.center[1] - (e.clientY - d.y) * k]))
  }
  const onUp = () => {
    drag.current = null
  }
  const saveIt = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = document.createElement('canvas')
      out.width = OUT
      out.height = OUT
      draw(out, OUT)
      await uploadPhoto(encodePhoto(out))
      toast(t('photo.saved'), 'success', 2200)
      closeModal()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return html`<${Sheet} title=${t('photo.cropTitle')} onClose=${closeModal}>
    <div class="col" style=${{ alignItems: 'center' }}>
      ${!img && !error && html`<${Shiba} body wag size=${80} />`}
      ${img &&
      html`<div class="crop-box" style=${{ width: `${VIEW}px`, height: `${VIEW}px` }}>
          <canvas ref=${viewRef} style=${{ width: `${VIEW}px`, height: `${VIEW}px` }} onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}
            role="img" aria-label=${t('photo.preview')}></canvas>
          <span class="crop-ring" aria-hidden="true"></span>
        </div>
        <label class="col" style=${{ width: '100%', maxWidth: `${VIEW}px`, gap: '4px' }}>
          <span class="small">${t('photo.zoom')}</span>
          <input type="range" min="1" max="3" step="0.01" value=${zoom} onInput=${(e) => {
            const z = Number(e.currentTarget.value)
            setZoom(z)
            setCenter((c) => (c ? clampCenter(c, Math.min(img.naturalWidth, img.naturalHeight) / z) : c))
          }} />
        </label>
        <p class="tiny muted center">${t('photo.dragHint')}</p>`}
      ${error && html`<p class="field-error" role="alert">${error}</p>`}
      <div class="sheet-actions" style=${{ width: '100%' }}>
        <button class="btn btn-ghost" onClick=${closeModal}>${t('common.cancel')}</button>
        <button class="btn btn-primary" disabled=${!img || busy} onClick=${saveIt}><${Icon} name="check" /> ${t('photo.save')}</button>
      </div>
    </div>
  </${Sheet}>`
}

// ---------- Appareils ----------

function DevicesCard({ u }) {
  const key = session.value?.key
  const [show, setShow] = useState(false)
  const devices = u.devices || []
  return html`<section class="card col">
    <h2><${Icon} name="devices" /> ${t('devices.title')}</h2>
    <p class="small">${t('devices.intro')}</p>
    ${devices.length > 0 &&
    html`<ul class="device-list">
      ${devices.map(
        (d) => html`<li key=${d.id} class=${d.current ? 'current' : ''}>
          <${Icon} name=${/iPhone|Android|iPad|mobile/i.test(d.name || '') ? 'devices' : 'devices'} size=${20} />
          <span class="grow"><b>${d.name || t('devices.unknown')}</b>${d.current ? html` <span class="pill mint tiny">${t('devices.thisOne')}</span>` : ''}<br />
            <span class="tiny muted">${d.current ? t('devices.activeNow') : t('devices.lastSeen', { when: ago(d.lastSeen) })}</span></span>
        </li>`,
      )}
    </ul>`}
    <button class="btn btn-primary" onClick=${() => openModal('qr')}><${Icon} name="qr" /> ${t('devices.showQr')}</button>
    <p class="label">${t('devices.orType')}</p>
    <div class="secret-box"><code aria-label=${t('common.identifier')}>${u.id}</code>
      <button class="icon-btn" onClick=${() => copyText(u.id, t('devices.idCopied'))} aria-label=${t('devices.copyId')}><${Icon} name="copy" /></button></div>
    ${key
      ? html`<div class="secret-box">
          <code aria-label=${t('common.key')}>${show ? key : '••••••••••••'}</code>
          <button class="icon-btn" onClick=${() => setShow(!show)} aria-label=${show ? t('devices.hideKey') : t('devices.showKey')}><${Icon} name=${show ? 'eyeOff' : 'eye'} /></button>
          <button class="icon-btn" onClick=${() => copyText(key, t('devices.keyCopied'))} aria-label=${t('devices.copyKey')}><${Icon} name="copy" /></button>
        </div>`
      : html`<p class="small muted">${t('devices.noKey')}</p>`}
    <div class="warning-box"><${Icon} name="alert" /><span>${t('devices.warning')}</span></div>
    <button class="btn btn-ghost btn-small" onClick=${() =>
      openModal('confirm', {
        title: t('devices.regenTitle'),
        text: t('devices.regenText'),
        confirm: t('devices.regenConfirm'),
        danger: true,
        onConfirm: async () => {
          try {
            await regenerateKey()
            setShow(true)
            await refreshMe()
            toast(t('devices.regenDone'), 'success')
          } catch (err) {
            errorToast(err)
            throw err
          }
        },
      })}><${Icon} name="refresh" /> ${devices.length > 1 ? t('devices.disconnectOthers') : t('devices.regen')}</button>
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
      setError(errorText(err))
    }
  }
  useEffect(() => {
    create()
  }, [])
  useEffect(() => {
    if (!link || used) return
    const timer = setInterval(async () => {
      try {
        const st = await api.get(`me/link/${link.token}`)
        if (st.used) {
          setUsed(true)
          toast(t('qr.connected'), 'success')
          refreshMe()
        }
      } catch {
        /* réessai au prochain tour */
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [link, used])
  const expired = link && now > link.expiresAt
  const url = link ? absoluteUrl(`/connexion/${link.token}`) : ''
  const qr = link ? qrPath(url) : null
  return html`<${Sheet} title=${t('devices.showQrTitle')} onClose=${closeModal}>
    <div class="qr-box">
      ${error && html`<p class="field-error">${error}</p>`}
      ${used
        ? html`<${Shiba} body mood="fete" size=${120} /><h3>${t('qr.doneTitle')}</h3><p class="muted">${t('qr.doneText')}</p>`
        : !link
          ? html`<${Shiba} body wag size=${80} />`
          : expired
            ? html`<${Shiba} mood="triste" size=${90} /><p>${t('qr.expired')}</p><button class="btn btn-primary" onClick=${create}>${t('qr.new')}</button>`
            : html`<svg class="qr" viewBox=${`0 0 ${qr.size} ${qr.size}`} role="img" aria-label=${t('qr.aria')} shape-rendering="crispEdges">
                  <rect width=${qr.size} height=${qr.size} fill="#fff" /><path d=${qr.d} fill="#4A3B36" /></svg>
                <p><b>${t('qr.scan')}</b></p>
                <p class="small muted">${t('qr.validity', { time: mmss(link.expiresAt - now) })}</p>
                <button class="btn btn-ghost btn-small" onClick=${() => copyText(url, t('qr.linkCopied'))}><${Icon} name="copy" /> ${t('qr.copyLink')}</button>`}
    </div>
  </${Sheet}>`
}

/** Rappel après la première partie : noter sa clé de connexion. */
export function KeyReminderSheet() {
  const close = () => {
    updateMe({ keyReminderShown: true }).catch(() => {})
    closeModal()
  }
  return html`<${Sheet} title=${t('keyReminder.title')} onClose=${close}>
    <div class="col" style=${{ alignItems: 'center', textAlign: 'center' }}>
      <${Shiba} body mood="wink" coat="sesame" size=${110} />
      <p>${t('keyReminder.text1', { id: me.value.id })}</p>
      <p class="small">${t('keyReminder.text2')}</p>
      <div class="sheet-actions" style=${{ justifyContent: 'center' }}>
        <button class="btn btn-ghost" onClick=${close}>${t('common.later')}</button>
        <button class="btn btn-primary" onClick=${() => {
          close()
          navigate(paths.profile())
        }}>${t('keyReminder.see')}</button>
      </div>
    </div>
  </${Sheet}>`
}
