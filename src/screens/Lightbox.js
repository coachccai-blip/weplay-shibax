// Agrandissement des dessins (miniatures des cartes de résultats et de l'écran de fin).
import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Icon } from '../components/icons.js'
import { t } from '../i18n/index.js'

const state = signal(null)

export function openLightbox(items, index = 0) {
  state.value = { items, index }
}

export function Lightbox() {
  const s = state.value
  useEffect(() => {
    if (!s) return
    const onKey = (e) => {
      if (e.key === 'Escape') state.value = null
      if (e.key === 'ArrowRight') state.value = { ...s, index: (s.index + 1) % s.items.length }
      if (e.key === 'ArrowLeft') state.value = { ...s, index: (s.index - 1 + s.items.length) % s.items.length }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [s])
  if (!s) return null
  const item = s.items[s.index]
  return html`<div class="lightbox" role="dialog" aria-modal="true" aria-label=${t('card.drawingAlt', { word: item.word })} onClick=${(e) => e.target === e.currentTarget && (state.value = null)}>
    <figure>
      <img src=${item.src} alt=${t('card.drawingAlt', { word: item.word })} />
      <figcaption>
        <span>${item.word}</span>
        <span class="row">
          ${s.items.length > 1 &&
          html`<button class="icon-btn" aria-label=${t('lightbox.prev')} onClick=${() => (state.value = { ...s, index: (s.index - 1 + s.items.length) % s.items.length })}><${Icon} name="back" /></button>
            <button class="icon-btn" aria-label=${t('lightbox.next')} onClick=${() => (state.value = { ...s, index: (s.index + 1) % s.items.length })}><${Icon} name="chevron" /></button>`}
          <button class="icon-btn" autofocus aria-label=${t('common.close')} onClick=${() => (state.value = null)}><${Icon} name="close" /></button>
        </span>
      </figcaption>
    </figure>
  </div>`
}
