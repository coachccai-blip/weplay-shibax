// Bienvenue : le compte est déjà créé, on présente le shiba et le pseudo tirés au sort.
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Shiba } from '../components/Shiba.js'
import { Icon } from '../components/icons.js'
import { me, updateMe, login, startFresh, boot, changeLang } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { randomPseudo, randomCoat } from '../../shared/names.js'
import { COATS } from '../../shared/progression.js'
import { LIMITS } from '../../shared/constants.js'
import { normalizeUserIdInput, normalizeKeyInput, USER_ID_RE, KEY_RE } from '../../shared/ids.js'
import { t, lang, LANGS, errorText } from '../i18n/index.js'

/** Choix de la langue (FR / EN), enregistré sur le compte. */
export function LangSwitch({ compact = false }) {
  return html`<div class="segmented lang-switch" role="group" aria-label=${t('common.language')}>
    ${LANGS.map(
      (l) => html`<button type="button" aria-pressed=${String(lang.value === l.id)} lang=${l.id} onClick=${() => changeLang(l.id)}>
        ${compact ? l.id.toUpperCase() : l.name}</button>`,
    )}
  </div>`
}

export function Welcome({ inviteName }) {
  const user = me.value
  const [pseudo, setPseudo] = useState(user.pseudo)
  const [coat, setCoat] = useState(user.coat)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [spin, setSpin] = useState(0)

  const reroll = () => {
    setPseudo(randomPseudo(lang.value))
    setCoat(randomCoat())
    setSpin((n) => n + 1)
    setError(null)
  }

  const submit = async (e) => {
    e?.preventDefault()
    const value = pseudo.trim()
    const len = Array.from(value).length
    if (len < LIMITS.pseudoMin || len > LIMITS.pseudoMax) {
      setError(t('err.pseudo_length'))
      return
    }
    setBusy(true)
    try {
      await updateMe({ pseudo: value, coat, onboarded: true, settings: { lang: lang.value } })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <${LangSwitch} />
      <img class="welcome-logo" src="/img/logo-512.webp" width="180" height="180" alt=${t('welcome.logoAlt')} />
      <div>
        <h1>${t('welcome.title')}</h1>
        <p class="muted">${t('welcome.subtitle')}</p>
      </div>
      ${inviteName && html`<p class="invite-hint">${t('welcome.invited', { name: inviteName })}</p>`}
      <form class="welcome-card" onSubmit=${submit}>
        <p class="small muted">${t('welcome.yourShiba')}</p>
        <div key=${spin} class="anim-pop"><${Shiba} body coat=${coat} mood="fete" size=${120} label=${t('welcome.shibaLabel', { coat: t(`coat.${coat}`) })} /></div>
        ${editing
          ? html`<div class="field" style=${{ width: '100%' }}>
              <label for="pseudo">${t('welcome.pseudoLabel')}</label>
              <input id="pseudo" class="input" value=${pseudo} maxlength="32" autocomplete="nickname" autofocus
                onInput=${(e) => {
                  setPseudo(e.currentTarget.value)
                  setError(null)
                }} />
              <span class="field-hint">${t('welcome.pseudoHint')}</span>
            </div>`
          : html`<p class="welcome-pseudo" aria-live="polite">${pseudo}</p>`}
        <div class="row wrap" style=${{ justifyContent: 'center' }}>
          <button type="button" class="btn btn-secondary btn-small" onClick=${reroll}><${Icon} name="dice" /> ${t('welcome.reroll')}</button>
          <button type="button" class="btn btn-secondary btn-small" onClick=${() => setEditing(!editing)}>
            <${Icon} name="edit" /> ${editing ? t('welcome.keepPseudo') : t('welcome.typePseudo')}
          </button>
        </div>
        <div class="coat-picker" role="group" aria-label=${t('profile.coat')}>
          ${COATS.map(
            (c) => html`<button type="button" class="coat-option" aria-pressed=${String(coat === c.id)} onClick=${() => setCoat(c.id)}>
              <${Shiba} coat=${c.id} size=${40} />${t(`coat.${c.id}`)}
            </button>`,
          )}
        </div>
        <p class="tiny muted">${t('welcome.photoLater')}</p>
        ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
        <button type="submit" class="btn btn-primary btn-big btn-block" disabled=${busy}>${t('welcome.go')}</button>
      </form>
      <button class="link-btn" onClick=${() => navigate(paths.login())}>${t('welcome.haveAccount')}</button>
      <a class="small muted" href="#/confidentialite">${t('privacy.title')}</a>
    </div>
  </div></main>`
}

export function Login() {
  const [id, setId] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const uid = normalizeUserIdInput(id)
    const k = normalizeKeyInput(key)
    if (!USER_ID_RE.test(uid) || !KEY_RE.test(k)) {
      setError(t('err.login_format'))
      return
    }
    setBusy(true)
    try {
      await login(uid, k)
      navigate(paths.home(), { replace: true })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <${LangSwitch} />
      <${Shiba} body coat="sesame" mood="concentre" size=${130} />
      <h1>${t('login.title')}</h1>
      <p class="muted">${t('login.subtitle')}</p>
      <form class="welcome-card" onSubmit=${submit} style=${{ alignItems: 'stretch', textAlign: 'left' }}>
        <div class="field">
          <label for="uid">${t('login.id')}</label>
          <input id="uid" class="input code" placeholder="SHX-XXXXXX" value=${id} autocomplete="username" autocapitalize="characters"
            spellcheck="false" onInput=${(e) => setId(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="key">${t('login.key')}</label>
          <input id="key" class="input code" placeholder=${t('login.keyPlaceholder')} value=${key} type="password" autocomplete="current-password"
            autocapitalize="characters" spellcheck="false" onInput=${(e) => setKey(e.currentTarget.value)} />
        </div>
        ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
        <button class="btn btn-primary btn-big btn-block" disabled=${busy}>${t('login.submit')}</button>
        <p class="small muted center">${t('login.qrHint')}</p>
      </form>
      <button class="link-btn" onClick=${() => (boot.value.status === 'ready' ? navigate(paths.home()) : startFresh())}>
        ${boot.value.status === 'ready' ? t('common.back') : t('login.newAccount')}
      </button>
    </div>
  </div></main>`
}

/** Session révoquée (clé régénérée ailleurs) ou déconnexion volontaire. */
export function Revoked({ message }) {
  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <${Shiba} body coat="creme" mood="surpris" size=${140} />
      <h1>${t('revoked.title')}</h1>
      <p class="muted">${message || t('revoked.text')}</p>
      <div class="welcome-card">
        <button class="btn btn-primary btn-big btn-block" onClick=${() => navigate(paths.login())}>${t('welcome.haveAccount')}</button>
        <button class="btn btn-secondary btn-block" onClick=${() => startFresh()}>${t('login.newAccount')}</button>
      </div>
    </div>
  </div></main>`
}
