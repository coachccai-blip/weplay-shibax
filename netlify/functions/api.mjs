// API de Weplay Shibax : comptes, salons, messages, parties, scores et XP.
// Toutes les actions sont validées ici avant d'être enregistrées dans Netlify Blobs.
import { handle } from '../../server/router.js'

export default async (req, context) => handle(req, context)

export const config = {
  path: '/api/*',
}
