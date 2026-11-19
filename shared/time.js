// Jours et semaines à l'heure de Paris (série quotidienne, classement hebdomadaire).

const TZ = 'Europe/Paris'
let fmt

function parts(ts) {
  fmt ||= new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const out = {}
  for (const p of fmt.formatToParts(new Date(ts))) out[p.type] = p.value
  return out
}

/** Jour calendaire à Paris, au format AAAA-MM-JJ. */
export function parisDay(ts = Date.now()) {
  const p = parts(ts)
  return `${p.year}-${p.month}-${p.day}`
}

function dayToUtc(day) {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToDay(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Nombre de jours entre deux jours AAAA-MM-JJ (b − a). */
export function dayDiff(a, b) {
  return Math.round((dayToUtc(b) - dayToUtc(a)) / 86400000)
}

export function addDays(day, n) {
  return utcToDay(dayToUtc(day) + n * 86400000)
}

/** Semaine (lundi → dimanche, heure de Paris) identifiée par la date de son lundi. */
export function parisWeek(ts = Date.now()) {
  const day = parisDay(ts)
  const dow = new Date(dayToUtc(day)).getUTCDay() // 0 = dimanche
  return addDays(day, -((dow + 6) % 7))
}

export function previousWeek(week) {
  return addDays(week, -7)
}

/** Jour UTC compact AAAAMMJJ et heure HH : partition des clés de messages. */
export function utcBucket(ts) {
  const d = new Date(ts)
  const day = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  return { day, hour: String(d.getUTCHours()).padStart(2, '0') }
}

/** Libellé lisible d'une semaine : « du 10 au 16 novembre ». */
export function weekLabel(week) {
  const start = new Date(dayToUtc(week))
  const end = new Date(dayToUtc(addDays(week, 6)))
  const month = (d) => d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })
  if (start.getUTCMonth() === end.getUTCMonth()) return `du ${start.getUTCDate()} au ${end.getUTCDate()} ${month(end)}`
  return `du ${start.getUTCDate()} ${month(start)} au ${end.getUTCDate()} ${month(end)}`
}
