// Zone de dessin : repère logique 800×600 (4:3), donc la même image sur tous les écrans.
// Le dessin est une suite d'opérations en ajout seul : tracé (k:'p'), annuler un trait (k:'u'), tout effacer (k:'c').
import { CANVAS_W, CANVAS_H, DRAW_COLORS, BRUSHES, ERASER } from '../../../shared/constants.js'

export function colorOf(c) {
  return c === ERASER ? '#ffffff' : DRAW_COLORS[c]?.hex || '#1d1a19'
}

export function widthOf(w, c) {
  const base = BRUSHES[w]?.size || 10
  return c === ERASER ? base * 2 : base
}

/** Modèle du dessin : liste ordonnée de traits. */
export class DrawingModel {
  constructor() {
    this.strokes = []
    this.index = new Map()
  }
  clear() {
    this.strokes = []
    this.index.clear()
  }
  /** Applique une opération ; renvoie ce qu'il faut redessiner. */
  apply(op, dev) {
    if (op.k === 'p') {
      const key = `${dev}/${op.i}`
      let s = this.index.get(key)
      if (!s) {
        s = { key, c: op.c, w: op.w, pts: [] }
        this.strokes.push(s)
        this.index.set(key, s)
      }
      const from = s.pts.length
      for (const v of op.p) s.pts.push(v)
      return { stroke: s, from }
    }
    if (op.k === 'u') {
      const key = `${dev}/${op.i}`
      if (this.index.has(key)) {
        this.index.delete(key)
        this.strokes = this.strokes.filter((s) => s.key !== key)
      }
      return { redraw: true }
    }
    if (op.k === 'c') {
      this.clear()
      return { redraw: true }
    }
    return {}
  }
}

/** Trace un trait (ou la fin d'un trait à partir du point `from`) avec un lissage par courbes. */
export function drawStroke(ctx, s, from = 0) {
  const p = s.pts
  const n = p.length / 2
  if (n === 0) return
  ctx.strokeStyle = colorOf(s.c)
  ctx.fillStyle = colorOf(s.c)
  ctx.lineWidth = widthOf(s.w, s.c)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (n === 1) {
    ctx.beginPath()
    ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const start = Math.max(1, from / 2)
  ctx.beginPath()
  // Point de départ : milieu du segment précédent (ou premier point).
  if (start <= 1) ctx.moveTo(p[0], p[1])
  else ctx.moveTo((p[2 * (start - 2)] + p[2 * (start - 1)]) / 2, (p[2 * (start - 2) + 1] + p[2 * (start - 1) + 1]) / 2)
  for (let i = start; i < n; i++) {
    const x0 = p[2 * (i - 1)]
    const y0 = p[2 * (i - 1) + 1]
    const x1 = p[2 * i]
    const y1 = p[2 * i + 1]
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  ctx.lineTo(p[2 * (n - 1)], p[2 * (n - 1) + 1])
  ctx.stroke()
}

export function paint(ctx, model, scale) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const s of model.strokes) drawStroke(ctx, s, 0)
}

/** Image du dessin (miniature des résultats). */
export function exportImage(model, width = 640) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round((width * CANVAS_H) / CANVAS_W)
  const ctx = c.getContext('2d')
  paint(ctx, model, width / CANVAS_W)
  return c.toDataURL('image/jpeg', 0.82)
}

/**
 * Canevas affiché : gère la taille réelle (densité de pixels), le rendu complet ou incrémental,
 * et le rejeu progressif des traits reçus (« trait par trait »).
 */
export class Surface {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.model = new DrawingModel()
    this.queue = []
    this.raf = null
    this.scale = 1
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.scale = w / CANVAS_W
    this.redraw()
  }

  redraw() {
    paint(this.ctx, this.model, this.scale)
  }

  reset() {
    this.queue = []
    this.model.clear()
    this.redraw()
  }

  /** Applique une opération immédiatement (dessinateur, ou reconstruction). */
  applyNow(op, dev) {
    const res = this.model.apply(op, dev)
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    if (res.redraw) this.redraw()
    else if (res.stroke) drawStroke(this.ctx, res.stroke, res.from)
  }

  /** Reconstruit tout le dessin à partir des lots (ordre identique pour tous). */
  rebuild(batches) {
    this.queue = []
    this.model.clear()
    for (const b of batches) for (const op of b.ops) this.model.apply(op, b.d)
    this.redraw()
  }

  /** Ajoute des lots reçus, rejoués progressivement (en moins de 0,4 s). */
  enqueue(batches, animate = true) {
    for (const b of batches) for (const op of b.ops) this.queue.push({ op: op.k === 'p' ? { ...op, p: [...op.p] } : op, dev: b.d })
    if (!animate) {
      this.flushQueue()
      return
    }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.step())
  }

  flushQueue() {
    while (this.queue.length) {
      const { op, dev } = this.queue.shift()
      this.applyNow(op, dev)
    }
  }

  step() {
    this.raf = null
    if (!this.queue.length) return
    const totalPts = this.queue.reduce((s, q) => s + (q.op.k === 'p' ? q.op.p.length / 2 : 1), 0)
    let budget = Math.max(6, Math.ceil(totalPts / 18))
    while (budget > 0 && this.queue.length) {
      const item = this.queue[0]
      if (item.op.k !== 'p') {
        this.queue.shift()
        this.applyNow(item.op, item.dev)
        budget--
        continue
      }
      const take = Math.min(item.op.p.length / 2, budget)
      const chunk = item.op.p.splice(0, take * 2)
      this.applyNow({ ...item.op, p: chunk }, item.dev)
      budget -= take
      if (!item.op.p.length) this.queue.shift()
    }
    if (this.queue.length) this.raf = requestAnimationFrame(() => this.step())
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  /** Coordonnées logiques d'un événement pointeur. */
  toLogical(e) {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H
    return [Math.round(Math.max(0, Math.min(CANVAS_W, x))), Math.round(Math.max(0, Math.min(CANVAS_H, y)))]
  }
}
