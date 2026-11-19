// Heure du serveur : le chrono affiché se cale dessus, même si l'horloge de l'appareil est décalée.

let offset = 0
let bestRtt = Infinity
const samples = []

/** Enregistre un échantillon (heure serveur reçue, heures locales d'envoi et de réception). */
export function syncClock(serverNow, sentAt, receivedAt) {
  if (!Number.isFinite(serverNow)) return
  const rtt = receivedAt - sentAt
  const sample = { offset: serverNow - (sentAt + rtt / 2), rtt, at: receivedAt }
  samples.push(sample)
  if (samples.length > 24) samples.shift()
  // On retient l'échantillon le plus fiable (aller-retour le plus court) des dernières minutes.
  const recent = samples.filter((s) => receivedAt - s.at < 5 * 60 * 1000)
  const best = recent.reduce((a, b) => (b.rtt < a.rtt ? b : a), recent[0])
  offset = best.offset
  bestRtt = best.rtt
}

export function serverNow() {
  return Date.now() + offset
}

export function clockInfo() {
  return { offset, rtt: bestRtt }
}
