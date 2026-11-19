// Points de rupture : mobile (< 768 px), tablette (768–1023 px), PC (≥ 1 024 px).
import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { serverNow } from './clock.js'

const tablet = matchMedia('(min-width: 768px)')
const desktop = matchMedia('(min-width: 1024px)')
const fine = matchMedia('(pointer: fine)')

function compute() {
  return desktop.matches ? 'desktop' : tablet.matches ? 'tablet' : 'mobile'
}

export const layout = signal(compute())
export const finePointer = signal(fine.matches)

tablet.addEventListener('change', () => (layout.value = compute()))
desktop.addEventListener('change', () => (layout.value = compute()))
fine.addEventListener('change', () => (finePointer.value = fine.matches))

/** Heure serveur rafraîchie régulièrement (chronos, comptes à rebours). */
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(serverNow())
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
