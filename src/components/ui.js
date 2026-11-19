// Composants d'interface communs.
import { useEffect, useRef, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from './icons.js'
import { Shiba } from './Shiba.js'
import { toasts, toast, closeModal, modal } from '../state/core.js'
import { online } from '../lib/transport.js'

/** Fenêtre (feuille sur mobile, boîte centrée sur PC) avec focus piégé et Échap. */
export function Sheet({ title, onClose, children, drawer = false, labelledBy }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const el = ref.current
    const focusables = () => [...el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled)
    const first = focusables()[0]
    ;(el.querySelector('[autofocus]') || first || el).focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
      if (e.key === 'Tab') {
        const list = focusables()
        if (!list.length) return
        const a = list[0]
        const z = list[list.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [])
  const id = labelledBy || `sheet-${title?.length || 0}`
  return html`<div class=${`overlay ${drawer ? 'drawer' : ''}`} onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby=${id} ref=${ref} tabindex="-1">
      <div class="sheet-header">
        <h2 id=${id}>${title}</h2>
        ${onClose && html`<button class="icon-btn" onClick=${onClose} aria-label="Fermer"><${Icon} name="close" /></button>`}
      </div>
      <div class="sheet-body">${children}</div>
    </div>
  </div>`
}

/** Confirmation (une seule action principale). */
export function ConfirmSheet({ title, text, confirm = 'Confirmer', danger = false, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await onConfirm()
      closeModal()
    } catch {
      setBusy(false)
    }
  }
  return html`<${Sheet} title=${title} onClose=${closeModal}>
    <p>${text}</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" onClick=${closeModal}>Annuler</button>
      <button class=${`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick=${run} disabled=${busy}>${confirm}</button>
    </div>
  </${Sheet}>`
}

export function Toasts() {
  return html`<div class="toasts" aria-live="polite" role="status">
    ${toasts.value.map((t) => html`<div class=${`toast ${t.kind}`} key=${t.id}>${t.text}</div>`)}
  </div>`
}

export function NetBanner() {
  if (online.value) return null
  return html`<div class="net-banner" role="alert"><${Icon} name="alert" size=${18} /> Connexion perdue… on réessaie.</div>`
}

export function EmptyState({ mood = 'content', coat = 'creme', title, text, children, body = true }) {
  return html`<div class="empty">
    <${Shiba} body=${body} mood=${mood} coat=${coat} size=${body ? 130 : 96} />
    ${title && html`<h2>${title}</h2>`}
    ${text && html`<p>${text}</p>`}
    ${children}
  </div>`
}

export function ErrorState({ error, onRetry, title = 'Oups !' }) {
  return html`<${EmptyState} mood="triste" coat="sesame" title=${title} text=${error?.message || 'Une erreur est survenue.'}>
    ${onRetry && html`<button class="btn btn-primary" onClick=${onRetry}><${Icon} name="refresh" /> Réessayer</button>`}
  </${EmptyState}>`
}

export async function copyText(text, done = 'Copié !') {
  try {
    await navigator.clipboard.writeText(text)
    toast(done, 'success', 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      toast(done, 'success', 2000)
    } catch {
      toast('Copie impossible : sélectionne le texte à la main.', 'error')
    }
    ta.remove()
  }
}

export function Segmented({ options, value, onChange, disabled = false, label }) {
  return html`<div class="segmented" role="group" aria-label=${label}>
    ${options.map(
      (o) => html`<button type="button" aria-pressed=${String(o.value === value)} disabled=${disabled}
        onClick=${() => !disabled && onChange(o.value)}>${o.label}</button>`,
    )}
  </div>`
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${String(!!checked)} aria-label=${label}
    disabled=${disabled} onClick=${() => !disabled && onChange(!checked)}></button>`
}

export function XpBar({ progress, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress || 0)) * 100)
  return html`<div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct} aria-label=${label || 'Progression vers le niveau suivant'}>
    <span style=${{ width: `${pct}%` }}></span>
  </div>`
}

/** Fenêtres globales ouvertes par `openModal(type, props)`. */
export function ModalHost({ registry }) {
  const m = modal.value
  if (!m) return null
  const Comp = registry[m.type]
  return Comp ? html`<${Comp} ...${m.props} />` : null
}
