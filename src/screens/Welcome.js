// Bienvenue : le compte est déjà créé, on présente le shiba et le pseudo tirés au sort.
import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Shiba } from '../components/Shiba.js'
import { Icon } from '../components/icons.js'
import { me, updateMe, login, startFresh, boot } from '../state/core.js'
import { navigate, paths } from '../lib/router.js'
import { randomPseudo, randomCoat } from '../../shared/names.js'
import { COATS } from '../../shared/progression.js'
import { LIMITS } from '../../shared/constants.js'
import { normalizeUserIdInput, normalizeKeyInput, USER_ID_RE, KEY_RE } from '../../shared/ids.js'

export function Welcome({ inviteName }) {
  const user = me.value
  const [pseudo, setPseudo] = useState(user.pseudo)
  const [coat, setCoat] = useState(user.coat)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [spin, setSpin] = useState(0)

  const reroll = () => {
    setPseudo(randomPseudo())
    setCoat(randomCoat())
    setSpin((n) => n + 1)
    setError(null)
  }

  const submit = async (e) => {
    e?.preventDefault()
    const value = pseudo.trim()
    const len = Array.from(value).length
    if (len < LIMITS.pseudoMin || len > LIMITS.pseudoMax) {
      setError('Ton pseudo doit faire entre 3 et 16 caractères.')
      return
    }
    setBusy(true)
    try {
      await updateMe({ pseudo: value, coat, onboarded: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <img class="welcome-logo" src="/img/logo-512.webp" width="200" height="200" alt="Weplay Shibax : deux shibas joueurs" />
      <div>
        <h1>Bienvenue sur Weplay Shibax !</h1>
        <p class="muted">Discute avec tes amis et lance des mini-jeux directement depuis la conversation.</p>
      </div>
      ${inviteName && html`<p class="invite-hint">Tu es invité dans le salon « ${inviteName} » 🎉</p>`}
      <form class="welcome-card" onSubmit=${submit}>
        <p class="small muted">Voici ton shiba et ton pseudo :</p>
        <div key=${spin} class="anim-pop"><${Shiba} body coat=${coat} mood="fete" size=${120} label=${`Ton shiba, pelage ${coat}`} /></div>
        ${editing
          ? html`<div class="field" style=${{ width: '100%' }}>
              <label for="pseudo">Ton pseudo</label>
              <input id="pseudo" class="input" value=${pseudo} maxlength="32" autocomplete="nickname" autofocus
                onInput=${(e) => {
                  setPseudo(e.currentTarget.value)
                  setError(null)
                }} />
              <span class="field-hint">3 à 16 caractères.</span>
            </div>`
          : html`<p class="welcome-pseudo" aria-live="polite">${pseudo}</p>`}
        <div class="row wrap" style=${{ justifyContent: 'center' }}>
          <button type="button" class="btn btn-secondary btn-small" onClick=${reroll}><${Icon} name="dice" /> Relancer le tirage</button>
          <button type="button" class="btn btn-secondary btn-small" onClick=${() => setEditing(!editing)}>
            <${Icon} name="edit" /> ${editing ? 'Garder ce pseudo' : 'Saisir mon pseudo'}
          </button>
        </div>
        <div class="coat-picker" role="group" aria-label="Pelage du shiba">
          ${COATS.map(
            (c) => html`<button type="button" class="coat-option" aria-pressed=${String(coat === c.id)} onClick=${() => setCoat(c.id)}>
              <${Shiba} coat=${c.id} size=${40} />${c.name}
            </button>`,
          )}
        </div>
        ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
        <button type="submit" class="btn btn-primary btn-big btn-block" disabled=${busy}>C’est parti !</button>
      </form>
      <button class="link-btn" onClick=${() => navigate(paths.login())}>J’ai déjà un compte</button>
      <a class="small muted" href="#/confidentialite">Confidentialité</a>
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
      setError('L’identifiant ressemble à SHX-AB3CD4 et la clé compte 12 caractères.')
      return
    }
    setBusy(true)
    try {
      await login(uid, k)
      navigate(paths.home(), { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <${Shiba} body coat="sesame" mood="concentre" size=${130} />
      <h1>J’ai déjà un compte</h1>
      <p class="muted">Saisis ton identifiant et ta clé de connexion. Tu les trouves dans le profil de ton autre appareil.</p>
      <form class="welcome-card" onSubmit=${submit} style=${{ alignItems: 'stretch', textAlign: 'left' }}>
        <div class="field">
          <label for="uid">Identifiant</label>
          <input id="uid" class="input code" placeholder="SHX-XXXXXX" value=${id} autocomplete="username" autocapitalize="characters"
            spellcheck="false" onInput=${(e) => setId(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="key">Clé de connexion</label>
          <input id="key" class="input code" placeholder="12 caractères" value=${key} type="password" autocomplete="current-password"
            autocapitalize="characters" spellcheck="false" onInput=${(e) => setKey(e.currentTarget.value)} />
        </div>
        ${error && html`<p class="field-error" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
        <button class="btn btn-primary btn-big btn-block" disabled=${busy}>Me connecter</button>
        <p class="small muted center">Encore plus simple : sur ton autre appareil, ouvre Profil › Connecter un appareil, puis scanne le QR code avec ce téléphone.</p>
      </form>
      <button class="link-btn" onClick=${() => (boot.value.status === 'ready' ? navigate(paths.home()) : startFresh())}>
        ${boot.value.status === 'ready' ? 'Retour' : 'Créer un nouveau compte'}
      </button>
    </div>
  </div></main>`
}

/** Session révoquée (clé régénérée ailleurs) ou déconnexion volontaire. */
export function Revoked({ message }) {
  return html`<main class="screen"><div class="screen-body">
    <div class="welcome">
      <${Shiba} body coat="creme" mood="surpris" size=${140} />
      <h1>Tu es déconnecté</h1>
      <p class="muted">${message || 'Ta session n’est plus valide sur cet appareil.'}</p>
      <div class="welcome-card">
        <button class="btn btn-primary btn-big btn-block" onClick=${() => navigate(paths.login())}>J’ai déjà un compte</button>
        <button class="btn btn-secondary btn-block" onClick=${() => startFresh()}>Créer un nouveau compte</button>
      </div>
    </div>
  </div></main>`
}
