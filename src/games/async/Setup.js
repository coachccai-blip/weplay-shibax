// Lancement d'un jeu dans la conversation (depuis le hub) : adversaire, mot, propositions, dessin.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { html } from '../../lib/html.js'
import { Icon } from '../../components/icons.js'
import { Avatar } from '../../components/Shiba.js'
import { Sheet, Segmented } from '../../components/ui.js'
import { me, closeModal, toast } from '../../state/core.js'
import { room } from '../../state/rooms.js'
import { createAsync, fetchSuggestions } from '../../state/async.js'
import { t, lang, errorText } from '../../i18n/index.js'
import { gameName } from '../../i18n/texts.js'
import { navigate, paths } from '../../lib/router.js'
import { Surface, exportImage } from '../drawit/surface.js'
import { DRAW_COLORS, BRUSHES, ERASER } from '../../../shared/constants.js'
import { validateCustomWord } from '../../../shared/text.js'
import { emojiOf } from './AsyncCard.js'

const wordError = (check) => t(`word.${check.code || 'chars'}`)

export function AsyncSetupSheet({ type, rid }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const launch = async (options, image) => {
    setBusy(true)
    setError(null)
    try {
      await createAsync(rid, type, options, image)
      closeModal()
      navigate(paths.room(rid))
      toast(t('ag.created'), 'success', 2200)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  const Form = FORMS[type] || SimpleForm
  return html`<${Sheet} title=${`${emojiOf(type)} ${gameName(type)}`} onClose=${closeModal}>
    <p class="small">${t(`game.${type}.rules`)}</p>
    <${Form} launch=${launch} busy=${busy} setError=${setError} />
    ${error && html`<p class="field-error" role="alert">${error}</p>`}
  </${Sheet}>`
}

function Actions({ busy, disabled, onGo, label }) {
  return html`<div class="sheet-actions">
    <button class="btn btn-ghost" onClick=${closeModal}>${t('common.cancel')}</button>
    <button class="btn btn-primary" disabled=${busy || disabled} onClick=${onGo}><${Icon} name="send" /> ${label || t('ag.setup.send')}</button>
  </div>`
}

function SimpleForm({ launch, busy }) {
  return html`<${Actions} busy=${busy} onGo=${() => launch({})} />`
}

// ---------- Duels : un adversaire du groupe, ou un défi ouvert ----------

function DuelForm({ launch, busy }) {
  const myId = me.value.id
  const members = (room.value?.members || []).filter((m) => m.id !== myId)
  const [who, setWho] = useState('')
  return html`<div class="col">
    <p class="label">${t('ag.setup.opponent')}</p>
    <div class="pick-list" role="radiogroup" aria-label=${t('ag.setup.opponent')}>
      <button type="button" role="radio" aria-checked=${String(who === '')} class="pick-item" onClick=${() => setWho('')}>
        <span class="duel-unknown" aria-hidden="true">?</span>
        <span class="grow"><b>${t('ag.setup.openChallenge')}</b><br /><span class="tiny muted">${t('ag.setup.openChallengeHint')}</span></span>
        ${who === '' && html`<${Icon} name="check" />`}
      </button>
      ${members.map(
        (m) => html`<button type="button" role="radio" key=${m.id} aria-checked=${String(who === m.id)} class="pick-item" onClick=${() => setWho(m.id)}>
          <${Avatar} user=${m} size=${32} /><span class="grow ellipsis">${m.pseudo}</span>${who === m.id && html`<${Icon} name="check" />`}
        </button>`,
      )}
    </div>
    ${members.length === 0 && html`<p class="tiny muted">${t('ag.setup.alone')}</p>`}
    <${Actions} busy=${busy} label=${t('ag.setup.challenge')} onGo=${() => launch(who ? { opponent: who } : {})} />
  </div>`
}

// ---------- Tu préfères ? ----------

function PollForm({ launch, busy }) {
  const [mode, setMode] = useState('random')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const ok = mode === 'random' || (a.trim().length >= 2 && b.trim().length >= 2)
  return html`<div class="col">
    <${Segmented} label=${t('ag.setup.pollMode')} value=${mode} onChange=${setMode}
      options=${[{ value: 'random', label: t('ag.setup.surprise') }, { value: 'custom', label: t('ag.setup.myOptions') }]} />
    ${mode === 'custom' &&
    html`<label class="label" for="opt-a">${t('ag.setup.optionA')}</label>
      <input id="opt-a" class="input" maxlength="80" value=${a} placeholder=${t('ag.setup.optionAHint')} onInput=${(e) => setA(e.currentTarget.value)} />
      <label class="label" for="opt-b">${t('ag.setup.optionB')}</label>
      <input id="opt-b" class="input" maxlength="80" value=${b} placeholder=${t('ag.setup.optionBHint')} onInput=${(e) => setB(e.currentTarget.value)} />`}
    <${Actions} busy=${busy} disabled=${!ok} onGo=${() => launch(mode === 'custom' ? { options: [a.trim(), b.trim()] } : {})} />
  </div>`
}

// ---------- Le pendu ----------

function PenduForm({ launch, busy, setError }) {
  const [mode, setMode] = useState('random')
  const [word, setWord] = useState('')
  const go = () => {
    if (mode === 'random') return launch({})
    const check = validateCustomWord(word)
    if (!check.ok) return setError(wordError(check))
    launch({ word: check.value })
  }
  return html`<div class="col">
    <${Segmented} label=${t('ag.setup.wordMode')} value=${mode} onChange=${setMode}
      options=${[{ value: 'random', label: t('ag.setup.surpriseWord') }, { value: 'custom', label: t('ag.setup.myWord') }]} />
    <p class="tiny muted">${mode === 'random' ? t('ag.setup.surpriseWordHint') : t('ag.setup.myWordHint')}</p>
    ${mode === 'custom' &&
    html`<label class="sr-only" for="hang-word">${t('ag.setup.myWord')}</label>
      <input id="hang-word" class="input" maxlength="25" value=${word} autocomplete="off" placeholder=${t('ag.setup.myWord')} onInput=${(e) => {
        setWord(e.currentTarget.value)
        setError(null)
      }} />`}
    <${Actions} busy=${busy} disabled=${mode === 'custom' && !word.trim()} onGo=${go} />
  </div>`
}

// ---------- Devine le nombre ----------

function DevineForm({ launch, busy }) {
  const [max, setMax] = useState(100)
  return html`<div class="col">
    <${Segmented} label=${t('ag.setup.range')} value=${max} onChange=${setMax} options=${[{ value: 100, label: '1 – 100' }, { value: 1000, label: '1 – 1000' }]} />
    <${Actions} busy=${busy} onGo=${() => launch({ max })} />
  </div>`
}

// ---------- Devine mon dessin : choisir un mot, dessiner, envoyer ----------

function DessinForm({ launch, busy, setError }) {
  const [words, setWords] = useState([])
  const [word, setWord] = useState(null)
  const [custom, setCustom] = useState('')
  const padRef = useRef(null)
  const refresh = () =>
    fetchSuggestions(lang.value)
      .then((res) => setWords(res.words || []))
      .catch(() => setWords([]))
  useEffect(() => {
    refresh()
  }, [])
  const pickCustom = (e) => {
    e.preventDefault()
    const check = validateCustomWord(custom)
    if (!check.ok) return setError(wordError(check))
    setError(null)
    setWord(check.value)
  }
  if (!word) {
    return html`<div class="col">
      <p class="label">${t('ag.setup.chooseWord')}</p>
      <div class="word-choices">
        ${words.map((w, i) => html`<button key=${w} class=${`word-choice ${['facile', 'moyen', 'difficile'][i] || ''}`} onClick=${() => setWord(w)}><span>${w}</span></button>`)}
      </div>
      <button class="btn btn-ghost btn-small" onClick=${refresh}><${Icon} name="refresh" /> ${t('ag.setup.otherWords')}</button>
      <form class="guess-form" onSubmit=${pickCustom}>
        <label for="draw-word" class="sr-only">${t('ag.setup.ownWord')}</label>
        <input id="draw-word" class="input" placeholder=${t('ag.setup.ownWord')} maxlength="25" value=${custom} autocomplete="off" onInput=${(e) => {
          setCustom(e.currentTarget.value)
          setError(null)
        }} />
        <button class="btn btn-secondary" disabled=${!custom.trim()}>${t('common.ok')}</button>
      </form>
    </div>`
  }
  const send = () => {
    const pad = padRef.current
    if (!pad || pad.count() === 0) return setError(t('ag.setup.drawFirst'))
    launch({ word }, exportImage(pad.surface.model, 640))
  }
  return html`<div class="col">
    <p class="row wrap">${t('ag.setup.drawThis')} <span class="secret-word">${word}</span>
      <button class="btn btn-ghost btn-small" onClick=${() => setWord(null)}>${t('ag.setup.changeWord')}</button></p>
    <${DrawPad} padRef=${padRef} />
    <p class="tiny muted">${t('ag.setup.drawRule')}</p>
    <${Actions} busy=${busy} onGo=${send} />
  </div>`
}

/** Petit bloc-notes de dessin (mêmes outils que Draw It), sans envoi en direct. */
function DrawPad({ padRef }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [tool, setToolState] = useState({ color: 0, brush: 1, eraser: false })
  const toolRef = useRef(tool)
  const st = useRef({ next: 0, strokes: [], active: null, last: null })
  const setTool = (patch) => {
    toolRef.current = { ...toolRef.current, ...patch }
    setToolState(toolRef.current)
  }
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const surface = new Surface(canvas)
    padRef.current = { surface, count: () => st.current.strokes.length }
    const ro = new ResizeObserver(() => surface.resize())
    ro.observe(wrapRef.current)
    const add = ([x, y]) => {
      const a = st.current.active
      if (!a) return
      const l = st.current.last
      if (l && Math.abs(l[0] - x) + Math.abs(l[1] - y) < 2) return
      st.current.last = [x, y]
      surface.applyNow({ k: 'p', i: a.i, c: a.c, w: a.w, p: [x, y] }, 'me')
    }
    const down = (e) => {
      if (e.button !== undefined && e.button > 0) return
      e.preventDefault()
      canvas.setPointerCapture?.(e.pointerId)
      const tl = toolRef.current
      const i = st.current.next++
      st.current.active = { i, c: tl.eraser ? ERASER : tl.color, w: tl.brush }
      st.current.strokes.push(i)
      st.current.last = null
      add(surface.toLogical(e))
    }
    const move = (e) => {
      if (!st.current.active) return
      e.preventDefault()
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
      for (const ev of evs.length ? evs : [e]) add(surface.toLogical(ev))
    }
    const up = () => {
      st.current.active = null
    }
    const block = (e) => e.preventDefault()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('touchstart', block, { passive: false })
    canvas.addEventListener('touchmove', block, { passive: false })
    return () => {
      ro.disconnect()
      surface.destroy()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('touchstart', block)
      canvas.removeEventListener('touchmove', block)
    }
  }, [])
  const undo = () => {
    const i = st.current.strokes.pop()
    if (i !== undefined) padRef.current.surface.applyNow({ k: 'u', i }, 'me')
  }
  const clearAll = () => {
    st.current.strokes = []
    padRef.current.surface.applyNow({ k: 'c' }, 'me')
  }
  return html`<div class="col" style=${{ gap: '8px' }}>
    <div class="canvas-wrap drawing" ref=${wrapRef}><canvas ref=${canvasRef} role="img" aria-label=${t('ag.setup.canvas')}></canvas></div>
    <div class="tools" role="toolbar" aria-label=${t('draw.tools')}>
      <div class="swatches" role="group" aria-label=${t('draw.colors')}>
        ${DRAW_COLORS.map(
          (c, i) => html`<button key=${c.id} class="swatch" style=${{ background: c.hex }} aria-label=${t(`color.${c.id}`)} title=${t(`color.${c.id}`)}
            aria-pressed=${String(!tool.eraser && tool.color === i)} onClick=${() => setTool({ color: i, eraser: false })}></button>`,
        )}
      </div>
      <span class="tool-sep" aria-hidden="true"></span>
      <div class="tool-group" role="group" aria-label=${t('draw.size')}>
        ${BRUSHES.map(
          (b, i) => html`<button key=${b.id} class="tool" aria-label=${t(`brush.${b.id}`)} title=${t(`brush.${b.id}`)} aria-pressed=${String(tool.brush === i)}
            onClick=${() => setTool({ brush: i })}><span class="brush-dot" style=${{ width: `${6 + i * 6}px`, height: `${6 + i * 6}px` }}></span></button>`,
        )}
      </div>
      <span class="tool-sep" aria-hidden="true"></span>
      <div class="tool-group">
        <button class="tool" aria-label=${t('draw.eraser')} title=${t('draw.eraser')} aria-pressed=${String(tool.eraser)} onClick=${() => setTool({ eraser: !tool.eraser })}><${Icon} name="eraser" /></button>
        <button class="tool" aria-label=${t('draw.undo')} title=${t('draw.undo')} onClick=${undo}><${Icon} name="undo" /></button>
        <button class="tool" aria-label=${t('draw.clear')} title=${t('draw.clear')} onClick=${clearAll}><${Icon} name="trash" /></button>
      </div>
    </div>
  </div>`
}

const FORMS = { morpion: DuelForm, puissance4: DuelForm, shifumi: DuelForm, tupreferes: PollForm, pendu: PenduForm, devine: DevineForm, dessin: DessinForm }
