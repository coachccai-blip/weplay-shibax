// Sons courts (synthétisés, aucun fichier), vibrations, animations réduites, confettis pastel.
import { signal, effect } from '@preact/signals'

export const settings = signal({ sound: true, motion: 'system' })

const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export const systemReduced = signal(!!mq?.matches)
mq?.addEventListener?.('change', (e) => {
  systemReduced.value = e.matches
})

export function reducedMotion() {
  const m = settings.value.motion
  return m === 'reduce' || (m === 'system' && systemReduced.value)
}

effect(() => {
  document.documentElement.dataset.motion = settings.value.motion || 'system'
})

// ---------- Sons ----------

let ctx = null
function audio() {
  if (!settings.value.sound) return null
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(ac, { freq, start = 0, dur = 0.12, type = 'sine', gain = 0.08, slide = 0 }) {
  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const SOUNDS = {
  pop: [{ freq: 660, dur: 0.07, slide: 1.25, gain: 0.05 }],
  send: [{ freq: 520, dur: 0.06, slide: 1.4, gain: 0.04 }],
  found: [
    { freq: 784, dur: 0.12 },
    { freq: 1175, start: 0.09, dur: 0.18 },
  ],
  other: [{ freq: 880, dur: 0.09, gain: 0.05 }],
  close: [{ freq: 440, dur: 0.09, type: 'triangle', gain: 0.06 }],
  tick: [{ freq: 1200, dur: 0.035, type: 'square', gain: 0.025 }],
  turn: [
    { freq: 523, dur: 0.1 },
    { freq: 659, start: 0.1, dur: 0.1 },
    { freq: 784, start: 0.2, dur: 0.16 },
  ],
  reveal: [{ freq: 392, dur: 0.16, type: 'triangle', slide: 1.5 }],
  win: [
    { freq: 523, dur: 0.12 },
    { freq: 659, start: 0.12, dur: 0.12 },
    { freq: 784, start: 0.24, dur: 0.12 },
    { freq: 1047, start: 0.36, dur: 0.3 },
  ],
  level: [
    { freq: 440, dur: 0.1, type: 'triangle' },
    { freq: 554, start: 0.1, dur: 0.1, type: 'triangle' },
    { freq: 659, start: 0.2, dur: 0.1, type: 'triangle' },
    { freq: 880, start: 0.3, dur: 0.35, type: 'triangle' },
  ],
  badge: [
    { freq: 988, dur: 0.08 },
    { freq: 1319, start: 0.08, dur: 0.22 },
  ],
}

export function play(name) {
  const ac = audio()
  if (!ac || !SOUNDS[name]) return
  for (const t of SOUNDS[name]) tone(ac, t)
}

/** Vibration courte sur mobile (bonne réponse). */
export function buzz(ms = 40) {
  try {
    if (!reducedMotion()) navigator.vibrate?.(ms)
  } catch {
    /* sans vibration */
  }
}

// ---------- Confettis pastel ----------

const PASTELS = ['#FFC9A3', '#D9CCF5', '#BFE8D4', '#BFDFF7', '#FFE9A8', '#F9B9B7']

export function confetti({ count = 140, duration = 2600 } = {}) {
  if (reducedMotion()) return
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = (canvas.width = innerWidth * dpr)
  const h = (canvas.height = innerHeight * dpr)
  const g = canvas.getContext('2d')
  const parts = Array.from({ length: count }, () => ({
    x: w * (0.2 + Math.random() * 0.6),
    y: h * 0.35 + (Math.random() - 0.5) * h * 0.1,
    vx: (Math.random() - 0.5) * 14 * dpr,
    vy: (-8 - Math.random() * 12) * dpr,
    r: (5 + Math.random() * 6) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: PASTELS[Math.floor(Math.random() * PASTELS.length)],
    shape: Math.random() < 0.3 ? 'circle' : 'rect',
  }))
  const t0 = performance.now()
  function frame(t) {
    const elapsed = t - t0
    g.clearRect(0, 0, w, h)
    for (const p of parts) {
      p.vy += 0.35 * dpr
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      g.save()
      g.globalAlpha = Math.max(0, 1 - elapsed / duration)
      g.translate(p.x, p.y)
      g.rotate(p.rot)
      g.fillStyle = p.color
      if (p.shape === 'circle') {
        g.beginPath()
        g.arc(0, 0, p.r / 2, 0, Math.PI * 2)
        g.fill()
      } else g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
      g.restore()
    }
    if (elapsed < duration) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
