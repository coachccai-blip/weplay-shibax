// Scheduled Function : ménage quotidien des messages (90 jours) et dessins (30 jours) expirés.
import { Db } from '../../server/db.js'
import { runCleanup } from '../../server/cleanup.js'

export default async () => {
  const report = await runCleanup(new Db())
  console.log('[cleanup]', JSON.stringify(report))
}

export const config = {
  schedule: '@daily',
}
