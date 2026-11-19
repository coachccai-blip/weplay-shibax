import { h } from 'preact'
import htm from 'htm'

/** Gabarits JSX sans compilation : html`<div class=${x}>…</div>`. */
export const html = htm.bind(h)
