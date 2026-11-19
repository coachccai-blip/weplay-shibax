// Draw It côté joueur : dessin en direct, outils, chrono calé sur le serveur, indices, propositions, scores.
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'preact/hooks'
import { html } from '../../lib/html.js'
import { Icon } from '../../components/icons.js'
import { Shiba, Avatar } from '../../components/Shiba.js'
import { game, strokes, act, uploadDrawing, joinGame } from '../../state/game.js'
import { me, toast, errorToast, deviceId } from '../../state/core.js'
import { api, ApiError } from '../../lib/transport.js'
import { serverNow } from '../../lib/clock.js'
import { useNow, layout } from '../../lib/layout.js'
import { play, buzz } from '../../lib/fx.js'
import { Surface, exportImage } from './surface.js'
import { DRAW_COLORS, BRUSHES, ERASER, LIMITS } from '../../../shared/constants.js'
import { validateCustomWord } from '../../../shared/text.js'

const DIFF_LABEL = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', perso: 'Mot perso' }
const FLUSH_MS = 200

function pseudoOf(view, uid) {
  return view.players.find((p) => p.id === uid)?.pseudo || 'Un shiba'
}

export function DrawIt() {
  const g = game.value
  const v = g.view
  const gs = v.g
  const myId = me.value.id
  const isDrawer = gs.drawerId === myId
  const myPlayer = v.players.find((p) => p.id === myId && !p.left)
  const late = myPlayer && myPlayer.fromRound > gs.round
  const now = useNow(250)
  const remaining = Math.max(0, gs.phaseEnd - now)
  const alert = gs.phase === 'drawing' && remaining <= 10000

  // Petit « tic » dans les 5 dernières secondes du dessin.
  const lastTick = useRef(0)
  useEffect(() => {
    const s = Math.ceil(remaining / 1000)
    if (gs.phase === 'drawing' && s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s
      play('tick')
    }
  }, [Math.ceil(remaining / 1000), gs.phase])

  const roundLabel = `Manche ${Math.min(gs.round + 1, gs.totalRounds)}/${gs.totalRounds} · Tour ${Math.min(gs.tour, gs.tours)}/${gs.tours}`

  return html`<div class="drawit">
    <div class="di-top">
      <span class="di-round">${roundLabel}</span>
      <span class=${`timer ${alert ? 'alert' : ''}`} role="timer" aria-live="off" aria-label=${`${Math.ceil(remaining / 1000)} secondes restantes`}>
        <${Icon} name=${alert ? 'alert' : 'clock'} size=${20} /> ${Math.ceil(remaining / 1000)} s
      </span>
      <div class="word-zone"><${WordZone} v=${v} gs=${gs} isDrawer=${isDrawer} now=${now} /></div>
    </div>
    <div class="di-stage">
      <${Board} v=${v} gs=${gs} isDrawer=${isDrawer} late=${late} now=${now} />
      ${!myPlayer && html`<${SpectatorBar} v=${v} />`}
      ${myPlayer && !isDrawer && gs.phase === 'drawing' && !late && html`<${GuessForm} v=${v} gs=${gs} />`}
      ${myPlayer && late && html`<p class="guess-feedback"><span class="pill sky">Tu joues dès la manche suivante !</span></p>`}
    </div>
    <div class="di-side">
      <${Scoreboard} v=${v} gs=${gs} />
      <${Feed} v=${v} />
    </div>
  </div>`
}

function WordZone({ v, gs, isDrawer, now }) {
  if (gs.phase === 'choosing') {
    return isDrawer
      ? html`<span class="pill apricot">À toi de dessiner : choisis ton mot !</span>`
      : html`<span class="pill sky">${pseudoOf(v, gs.drawerId)} choisit un mot…</span>`
  }
  if (gs.phase === 'reveal') return html`<span class="pill butter">Le mot était « ${gs.last?.word || '—'} »</span>`
  if (isDrawer) {
    return html`<span class="secret-word" aria-label=${`Ton mot : ${gs.word}`}>${gs.word}</span>
      <span class="pill">${DIFF_LABEL[gs.difficulty]} ×${String(gs.mult).replace('.', ',')}</span>`
  }
  const cells = gs.hint?.cells || []
  const letters = cells.filter((c) => c.t === 'l').length
  return html`<div class="hint" aria-label=${`Mot de ${letters} lettres`}>
    ${cells.map((c, i) =>
      c.t === 'l'
        ? html`<span key=${i} class=${`cell ${c.c ? 'revealed' : ''}`}>${c.c || ''}</span>`
        : c.t === 's'
          ? html`<span key=${i} class="gap"></span>`
          : html`<span key=${i} class="mark">${c.t === 'd' ? '-' : '’'}</span>`,
    )}
    <span class="pill white" style=${{ marginLeft: '6px' }}>${letters} lettres${gs.mult > 1 ? ` · ×${String(gs.mult).replace('.', ',')}` : ''}</span>
  </div>`
}

// ---------- Zone de dessin ----------

function Board({ v, gs, isDrawer, late, now }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const surfaceRef = useRef(null)
  const toolRef = useRef({ color: 0, brush: 1, eraser: false })
  const [tool, setToolState] = useState(toolRef.current)
  const sender = useRef(null)
  const myDev = deviceId()
  const gid = game.value.gid
  const round = gs.round
  const canDraw = isDrawer && gs.phase === 'drawing'
  const [ready, setReady] = useState(strokes.round === round)

  const setTool = (patch) => {
    toolRef.current = { ...toolRef.current, ...patch }
    setToolState(toolRef.current)
  }

  // Création de la surface + redimensionnement.
  useLayoutEffect(() => {
    const surface = new Surface(canvasRef.current)
    surfaceRef.current = surface
    const ro = new ResizeObserver(() => surface.resize())
    ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      surface.destroy()
    }
  }, [])

  // Traits reçus : rejeu progressif (ou reconstruction complète si l'ordre l'exige).
  useEffect(() => {
    const surface = surfaceRef.current
    let lastAt = 0
    const rebuild = () => {
      const all = strokes.ordered().filter((b) => !(isDrawer && b.d === myDev && sender.current?.drawnLocally(b.s)))
      surface.rebuild(strokes.ordered())
      lastAt = all.at(-1)?.at || 0
    }
    if (strokes.round === round) {
      rebuild()
      setReady(true)
    } else surface.reset()
    return strokes.subscribe((evt) => {
      if (evt.reset) {
        surface.reset()
        lastAt = 0
        setReady(strokes.round === round)
        return
      }
      setReady(true)
      const added = evt.added.filter((b) => !(b.d === myDev && sender.current?.drawnLocally(b.s)))
      if (!added.length) return
      const outOfOrder = added.some((b) => b.at < lastAt)
      if (outOfOrder) rebuild()
      else {
        surface.enqueue(added.sort((a, b) => a.at - b.at || a.s - b.s))
        lastAt = Math.max(lastAt, ...added.map((b) => b.at))
      }
    })
  }, [round, isDrawer])

  // Envoi des traits du dessinateur : lots toutes les 200 ms, envoyés dans l'ordre, nouvel essai automatique.
  useEffect(() => {
    if (!isDrawer || gs.phase !== 'drawing') return
    const mine = [...strokes.batches.values()].filter((b) => b.d === myDev)
    const s = new StrokeSender(gid, round, mine)
    sender.current = s
    return () => s.stop()
  }, [isDrawer, gs.phase, round, ready])

  // Saisie au doigt, au stylet ou à la souris.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canDraw) return
    let active = null
    const down = (e) => {
      if (!sender.current || !ready) return
      if (e.button !== undefined && e.button > 0) return
      e.preventDefault()
      canvas.setPointerCapture?.(e.pointerId)
      const t = toolRef.current
      const c = t.eraser ? ERASER : t.color
      active = sender.current.begin(c, t.brush)
      const p = surfaceRef.current.toLogical(e)
      addPoint(p)
    }
    const addPoint = (p) => {
      const op = sender.current.point(active, p)
      if (op) surfaceRef.current.applyNow(op, myDev)
    }
    const move = (e) => {
      if (active === null) return
      e.preventDefault()
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
      for (const ev of events.length ? events : [e]) addPoint(surfaceRef.current.toLogical(ev))
    }
    const up = (e) => {
      if (active === null) return
      e.preventDefault()
      active = null
      sender.current.end()
    }
    const block = (e) => e.preventDefault()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('touchstart', block, { passive: false })
    canvas.addEventListener('touchmove', block, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('touchstart', block)
      canvas.removeEventListener('touchmove', block)
    }
  }, [canDraw, ready])

  // Miniature du dessin à la fin de la manche (par le dessinateur ; à défaut, le premier devineur présent).
  const uploaded = useRef(new Set())
  useEffect(() => {
    if (gs.phase !== 'reveal' || !gs.last?.word || uploaded.current.has(gs.last.i)) return
    const drawerHere = game.value.presence?.[gs.drawerId] && serverNow() - game.value.presence[gs.drawerId] < LIMITS.absentMs
    const backup = v.players.filter((p) => !p.left && p.id !== gs.drawerId).map((p) => p.id).sort()[0]
    const mine = gs.drawerId === me.value.id
    if (!mine && (drawerHere || backup !== me.value.id)) return
    uploaded.current.add(gs.last.i)
    const t = setTimeout(() => uploadDrawing(game.value.gid, gs.last.i, exportImage(surfaceRef.current.model)), mine ? 150 : 1800)
    return () => clearTimeout(t)
  }, [gs.phase, gs.last?.i])

  const undo = () => {
    const op = sender.current?.undo()
    if (op) surfaceRef.current.applyNow(op, myDev)
  }
  const clearAll = () => {
    const op = sender.current?.clear()
    if (op) surfaceRef.current.applyNow(op, myDev)
  }
  const skip = async () => {
    try {
      await act({ type: 'skip', round })
    } catch (err) {
      errorToast(err)
    }
  }

  return html`<div class="col" style=${{ gap: '8px' }}>
    <div class=${`canvas-wrap ${canDraw ? 'drawing' : ''}`} ref=${wrapRef}>
      <canvas ref=${canvasRef} role="img" aria-label=${canDraw ? 'Zone de dessin : dessine ton mot ici' : 'Dessin en cours'}></canvas>
      ${gs.phase === 'choosing' && html`<${ChoosingOverlay} v=${v} gs=${gs} isDrawer=${isDrawer} now=${now} />`}
      ${gs.phase === 'reveal' && html`<${RevealOverlay} v=${v} gs=${gs} />`}
    </div>
    ${canDraw &&
    html`<div class="tools" role="toolbar" aria-label="Outils de dessin">
      <div class="swatches" role="group" aria-label="Couleurs">
        ${DRAW_COLORS.map(
          (c, i) => html`<button class="swatch" style=${{ background: c.hex }} aria-label=${c.name} title=${c.name}
            aria-pressed=${String(!tool.eraser && tool.color === i)} onClick=${() => setTool({ color: i, eraser: false })}></button>`,
        )}
      </div>
      <span class="tool-sep" aria-hidden="true"></span>
      <div class="tool-group" role="group" aria-label="Épaisseur">
        ${BRUSHES.map(
          (b, i) => html`<button class="tool" aria-label=${`Crayon ${b.name.toLowerCase()}`} title=${b.name} aria-pressed=${String(tool.brush === i)}
            onClick=${() => setTool({ brush: i })}><span class="brush-dot" style=${{ width: `${6 + i * 6}px`, height: `${6 + i * 6}px` }}></span></button>`,
        )}
      </div>
      <span class="tool-sep" aria-hidden="true"></span>
      <div class="tool-group">
        <button class="tool" aria-label="Gomme" title="Gomme" aria-pressed=${String(tool.eraser)} onClick=${() => setTool({ eraser: !tool.eraser })}><${Icon} name="eraser" /></button>
        <button class="tool" aria-label="Annuler le dernier trait" title="Annuler" onClick=${undo}><${Icon} name="undo" /></button>
        <button class="tool" aria-label="Tout effacer" title="Tout effacer" onClick=${clearAll}><${Icon} name="trash" /></button>
      </div>
      <button class="btn btn-small btn-danger" onClick=${skip}><${Icon} name="skip" /> Passer</button>
    </div>
    <p class="draw-rule">Règle : n’écris pas le mot en toutes lettres 😉 Si tu passes, tu ne marques pas de points.</p>`}
  </div>`
}

/** File d'envoi des traits : un lot à la fois, dans l'ordre, rejoué jusqu'à réussite. */
class StrokeSender {
  constructor(gid, round, existing) {
    this.gid = gid
    this.round = round
    this.seq = existing.reduce((m, b) => Math.max(m, b.s + 1), 0)
    this.firstSeq = this.seq
    this.nextId = 0
    for (const b of existing) for (const op of b.ops) if (op.k === 'p') this.nextId = Math.max(this.nextId, op.i + 1)
    this.myStrokes = []
    for (const b of existing) for (const op of b.ops) if (op.k === 'p' && !this.myStrokes.includes(op.i)) this.myStrokes.push(op.i)
    this.pending = []
    this.current = null
    this.queue = []
    this.sending = false
    this.stopped = false
    this.delay = 300
    this.timer = setInterval(() => this.flush(), FLUSH_MS)
  }
  drawnLocally(seq) {
    return seq >= this.firstSeq
  }
  begin(c, w) {
    const i = this.nextId++
    this.current = { k: 'p', i, c, w, p: [] }
    this.last = null
    this.myStrokes.push(i)
    this.pending.push(this.current)
    return i
  }
  point(i, [x, y]) {
    if (!this.current || this.current.i !== i) return null
    if (this.last && Math.abs(this.last[0] - x) + Math.abs(this.last[1] - y) < 2) return null
    const first = !this.last
    this.last = [x, y]
    this.current.p.push(x, y)
    // Début de trait : envoi immédiat, sans attendre le prochain lot.
    if (first) queueMicrotask(() => this.flush())
    return { k: 'p', i, c: this.current.c, w: this.current.w, p: [x, y] }
  }
  end() {
    this.flush()
    this.current = null
  }
  undo() {
    const i = this.myStrokes.pop()
    if (i === undefined) return null
    this.flush()
    const op = { k: 'u', i }
    this.pending.push(op)
    this.flush()
    return op
  }
  clear() {
    this.flush()
    const op = { k: 'c' }
    this.myStrokes = []
    this.pending.push(op)
    this.flush()
    return op
  }
  flush() {
    const ops = this.pending.filter((op) => op.k !== 'p' || op.p.length >= 2)
    this.pending = []
    // Un trait en cours continue dans le lot suivant (même identifiant).
    if (this.current) {
      const cont = { k: 'p', i: this.current.i, c: this.current.c, w: this.current.w, p: [] }
      this.current = cont
      this.pending.push(cont)
    }
    if (!ops.length) return
    this.queue.push({ seq: this.seq++, ops })
    this.pump()
  }
  async pump() {
    if (this.sending || this.stopped || !this.queue.length) return
    this.sending = true
    const batch = this.queue[0]
    try {
      await api.post(`games/${this.gid}/strokes`, { round: this.round, seq: batch.seq, ops: batch.ops }, { timeout: 8000 })
      this.queue.shift()
      this.delay = 300
    } catch (err) {
      if (err instanceof ApiError && ['round_over', 'not_drawing', 'not_drawer'].includes(err.code)) {
        this.queue = []
        this.stopped = true
      } else {
        await new Promise((r) => setTimeout(r, this.delay))
        this.delay = Math.min(3000, this.delay * 2)
      }
    } finally {
      this.sending = false
      if (this.queue.length && !this.stopped) this.pump()
    }
  }
  stop() {
    this.flush()
    clearInterval(this.timer)
    // On laisse partir les derniers lots déjà en file.
  }
}

function ChoosingOverlay({ v, gs, isDrawer, now }) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const left = Math.max(0, Math.ceil((gs.phaseEnd - now) / 1000))
  const choose = async (body) => {
    setBusy(true)
    try {
      await act({ ...body, round: gs.round })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  if (!isDrawer) {
    const drawer = v.players.find((p) => p.id === gs.drawerId)
    return html`<div class="stage-overlay"><div class="stage-card">
      <${Shiba} coat=${drawer?.coat} acc=${drawer?.acc} mood="concentre" size=${90} />
      <h2>${drawer?.pseudo || 'Le dessinateur'} choisit un mot…</h2>
      <p class="muted">Prépare-toi à deviner ! (${left} s)</p>
    </div></div>`
  }
  const submitCustom = (e) => {
    e.preventDefault()
    const check = validateCustomWord(custom)
    if (!check.ok) return setError(check.error)
    choose({ type: 'custom', word: check.value })
  }
  return html`<div class="stage-overlay"><div class="stage-card">
    <h2>À toi de dessiner !</h2>
    <p class="small muted">Choisis un mot (${left} s). Sans choix, le mot facile est retenu.</p>
    <div class="word-choices">
      ${(gs.choices || []).map(
        (c, i) => html`<button class=${`word-choice ${c.difficulty}`} disabled=${busy} onClick=${() => choose({ type: 'choose', index: i })}>
          <span>${c.word}</span><small>${DIFF_LABEL[c.difficulty]} ×${String(c.mult).replace('.', ',')}</small>
        </button>`,
      )}
    </div>
    ${gs.canCustom &&
    html`<form class="guess-form" onSubmit=${submitCustom}>
      <label for="custom-word" class="sr-only">Mon propre mot</label>
      <input id="custom-word" class="input" placeholder="Mon propre mot" maxlength="25" value=${custom}
        onInput=${(e) => {
          setCustom(e.currentTarget.value)
          setError(null)
        }} />
      <button class="btn btn-secondary" disabled=${busy || !custom.trim()}>OK</button>
    </form>`}
    ${error && html`<p class="field-error" role="alert">${error}</p>`}
  </div></div>`
}

const REASONS = {
  found: 'Tout le monde a trouvé, bien joué la meute !',
  time: 'Temps écoulé !',
  skip: 'Le dessinateur a passé son tour.',
  left: 'Le dessinateur n’est plus là : on passe au suivant.',
}

function RevealOverlay({ v, gs }) {
  const last = gs.last
  if (!last) return null
  const rows = Object.entries(last.points || {}).sort((a, b) => b[1] - a[1])
  return html`<div class="stage-overlay"><div class="stage-card">
    ${last.word ? html`<p class="small muted">Le mot était</p><p class="reveal-word">${last.word}</p>` : html`<${Shiba} mood="surpris" size=${70} />`}
    <p class="small"><b>${REASONS[last.reason] || ''}</b></p>
    ${rows.length > 0 &&
    html`<ul class="round-points">
      ${rows.map(([uid, pts]) => {
        const p = v.players.find((x) => x.id === uid)
        return html`<li key=${uid}><${Avatar} user=${p} size=${28} /> <span class="ellipsis">${p?.pseudo || '?'}</span>
          ${uid === last.drawerId && html`<span class="pill apricot"><${Icon} name="pencil" size=${12} /> dessin</span>`}
          ${uid === last.firstId && html`<span class="pill butter">1er !</span>`}
          <span class=${`pts ${pts > 0 ? 'plus' : ''}`}>+${pts}</span></li>`
      })}
    </ul>`}
  </div></div>`
}

// ---------- Propositions ----------

function GuessForm({ v, gs }) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef(null)
  const found = game.value.foundIds.includes(me.value.id)
  useEffect(() => setFeedback(null), [gs.round])
  useEffect(() => {
    if (!cooldown) return
    const t = setTimeout(() => setCooldown(0), Math.max(0, cooldown - Date.now()))
    return () => clearTimeout(t)
  }, [cooldown])
  if (found || feedback?.kind === 'correct') {
    return html`<p class="guess-feedback" role="status"><span class="pill mint"><${Icon} name="check" size=${16} /> Tu as trouvé ! ${feedback?.points ? `+${feedback.points} points` : ''}</span></p>`
  }
  const submit = async (e) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || cooldown) return
    setText('')
    setCooldown(Date.now() + LIMITS.guessIntervalMs)
    try {
      const res = await act({ type: 'guess', text: value, round: gs.round })
      if (res.result === 'correct') {
        setFeedback({ kind: 'correct', points: res.points })
        play('found')
        buzz(60)
        document.querySelector('.scoreboard .me .shiba')?.classList.add('me-jump')
        toast(`Bravo ! +${res.points} points${res.first ? ' (premier !)' : ''}`, 'success')
      } else if (res.result === 'close') {
        setFeedback({ kind: 'close' })
        play('close')
      } else if (res.result === 'masked') setFeedback({ kind: 'masked' })
      else setFeedback(null)
    } catch (err) {
      if (err.code === 'too_fast') setFeedback({ kind: 'slow' })
      else if (err.code !== 'round_over') errorToast(err)
    }
    inputRef.current?.focus()
  }
  return html`<div class="col" style=${{ gap: '4px' }}>
    <form class="guess-form" onSubmit=${submit}>
      <label for="guess" class="sr-only">Ta proposition</label>
      <input id="guess" ref=${inputRef} class="input" placeholder="Ta proposition…" maxlength="60" value=${text} autocomplete="off" autocorrect="off"
        autocapitalize="off" spellcheck="false" enterkeyhint="send" onInput=${(e) => setText(e.currentTarget.value)} />
      <button class="btn btn-primary" disabled=${!text.trim() || !!cooldown}><${Icon} name="send" /> Proposer</button>
    </form>
    <p class="guess-feedback" aria-live="polite">
      ${feedback?.kind === 'close' && html`<span class="pill butter">🔥 Tu chauffes !</span>`}
      ${feedback?.kind === 'masked' && html`<span class="pill sky">Ta proposition contient le mot : elle est masquée pour les autres.</span>`}
      ${feedback?.kind === 'slow' && html`<span class="pill coral">Une proposition par seconde, pas plus !</span>`}
    </p>
  </div>`
}

function Scoreboard({ v, gs }) {
  const foundIds = game.value.foundIds
  const presence = game.value.presence || {}
  const myId = me.value.id
  const players = v.players.filter((p) => !p.left).sort((a, b) => b.score - a.score)
  const now = serverNow()
  return html`<ol class="scoreboard" aria-label="Scores">
    ${players.map((p) => {
      const drawer = p.id === gs.drawerId && gs.phase !== 'reveal'
      const found = foundIds.includes(p.id)
      const absent = p.id !== myId && presence[p.id] && now - presence[p.id] > LIMITS.absentMs
      return html`<li key=${p.id} class=${`${found ? 'found' : ''} ${drawer ? 'drawer' : ''} ${absent ? 'absent' : ''} ${p.id === myId ? 'me' : ''}`}>
        <${Avatar} user=${p} size=${32} mood=${found ? 'fete' : drawer ? 'concentre' : 'content'} />
        <span class="col" style=${{ gap: 0, minWidth: 0 }}>
          <span class="score-name">${p.pseudo}${p.id === myId ? ' (toi)' : ''}</span>
          <span class="score-tag">
            ${drawer && html`<span class="row" style=${{ gap: '2px' }}><${Icon} name="pencil" size=${12} /> dessine</span>`}
            ${found && html`<span class="row" style=${{ gap: '2px' }}><${Icon} name="check" size=${12} /> trouvé</span>`}
            ${absent && html`<span>· absent</span>`}
          </span>
        </span>
        <span class="score-pts">${p.score} pts</span>
      </li>`
    })}
  </ol>`
}

function Feed({ v }) {
  const ref = useRef(null)
  const guesses = game.value.guesses
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [guesses.length])
  return html`<div class="feed" ref=${ref} role="log" aria-live="polite" aria-label="Propositions">
    ${!guesses.length && html`<p class="small muted center" style=${{ margin: 'auto' }}>Les propositions apparaîtront ici.</p>`}
    ${guesses.map((x) => {
      const who = pseudoOf(v, x.uid)
      if (x.k === 'f') return html`<div class="feed-item found" key=${x.id}>🎉 ${who} a trouvé !</div>`
      if (x.k === 'm') return html`<div class="feed-item masked" key=${x.id}><b>${who}</b> : proposition masquée 🙈</div>`
      return html`<div class="feed-item" key=${x.id}><b>${who}</b> : ${x.text}</div>`
    })}
  </div>`
}

function SpectatorBar({ v }) {
  const full = v.players.filter((p) => !p.left).length >= v.maxPlayers
  return html`<div class="game-banner">
    <span class="grow">Tu regardes la partie. Rejoins-la pour jouer dès la manche suivante !</span>
    <button class="btn btn-small btn-primary" disabled=${full} onClick=${() => joinGame().catch(() => {})}>${full ? 'Complet' : 'Rejoindre'}</button>
  </div>`
}
