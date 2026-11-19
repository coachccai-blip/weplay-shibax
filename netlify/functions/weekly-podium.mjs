// Scheduled Function : chaque lundi, annonce dans chaque salon le podium de la semaine écoulée.
// (L'annonce est aussi déclenchée à la première visite d'un salon dans la semaine, si besoin.)
import { Db } from '../../server/db.js'
import { lastSegment } from '../../server/keys.js'
import { weeklyPodium } from '../../server/rewards.js'

export default async () => {
  const db = new Db()
  const deadline = Date.now() + 22000
  const rooms = (await db.keys('room/')).map(lastSegment)
  let posted = 0
  for (const rid of rooms) {
    if (Date.now() > deadline) break
    if (await weeklyPodium(db, rid).catch(() => false)) posted++
  }
  console.log('[weekly-podium]', JSON.stringify({ rooms: rooms.length, posted }))
}

export const config = {
  // Lundi 00:15 UTC = lundi 01:15 ou 02:15 à Paris : la semaine précédente est close.
  schedule: '15 0 * * 1',
}
