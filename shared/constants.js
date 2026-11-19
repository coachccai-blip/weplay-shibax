// Règles et limites communes à l'interface et aux Functions.

export const LIMITS = {
  pseudoMin: 3,
  pseudoMax: 16,
  roomNameMin: 3,
  roomNameMax: 30,
  roomMaxMembers: 20,
  messageMax: 500,
  pageSize: 50,
  burstCount: 5, // messages…
  burstWindowMs: 5000, // …en 5 secondes au plus
  burstPauseMs: 5000, // pause imposée au-delà
  presenceMs: 30000, // pastille « en ligne »
  lobbyTimeoutMs: 10 * 60 * 1000,
  linkTtlMs: 10 * 60 * 1000, // QR code de connexion
  guessIntervalMs: 1000, // une proposition par seconde au plus
  absentMs: 10000, // joueur injoignable
  messagesRetentionDays: 90,
  drawingsRetentionDays: 30,
}

/** Réactions illustrées par le shiba. */
export const REACTIONS = [
  { id: 'coeur', label: 'J’adore' },
  { id: 'rire', label: 'Trop drôle' },
  { id: 'wouah', label: 'Waouh' },
  { id: 'snif', label: 'Snif' },
  { id: 'bravo', label: 'Bravo' },
  { id: 'ouaf', label: 'Ouaf !' },
]
export const REACTION_IDS = REACTIONS.map((r) => r.id)

/** Zone de dessin logique (4:3) identique pour tous les écrans. */
export const CANVAS_W = 800
export const CANVAS_H = 600

/** 12 couleurs franches, lisibles sur fond blanc. */
export const DRAW_COLORS = [
  { id: 'noir', name: 'Noir', hex: '#1d1a19' },
  { id: 'gris', name: 'Gris', hex: '#8a8a8a' },
  { id: 'marron', name: 'Marron', hex: '#8b4a1f' },
  { id: 'rouge', name: 'Rouge', hex: '#e02b2b' },
  { id: 'orange', name: 'Orange', hex: '#f57c00' },
  { id: 'jaune', name: 'Jaune', hex: '#f6c700' },
  { id: 'vert-clair', name: 'Vert clair', hex: '#6cc644' },
  { id: 'vert-fonce', name: 'Vert foncé', hex: '#1b7a3a' },
  { id: 'bleu-clair', name: 'Bleu clair', hex: '#3fb6f0' },
  { id: 'bleu-fonce', name: 'Bleu foncé', hex: '#1f3fae' },
  { id: 'violet', name: 'Violet', hex: '#8e3bc4' },
  { id: 'rose', name: 'Rose', hex: '#f0569b' },
]
export const ERASER = 12 // index « gomme » (peint en blanc)
export const BRUSHES = [
  { id: 'fin', name: 'Fin', size: 4 },
  { id: 'moyen', name: 'Moyen', size: 10 },
  { id: 'epais', name: 'Épais', size: 24 },
]

export const THEMES = [
  { id: 'animaux', name: 'Animaux' },
  { id: 'nourriture', name: 'Nourriture' },
  { id: 'objets', name: 'Objets' },
  { id: 'lieux', name: 'Lieux' },
  { id: 'metiers', name: 'Métiers' },
  { id: 'actions', name: 'Actions' },
]
export const THEME_IDS = THEMES.map((t) => t.id)

/** Catalogue du hub. Les jeux « Bientôt » sont grisés. */
export const GAME_CATALOG = [
  {
    id: 'drawit',
    name: 'Draw It',
    tagline: 'Dessine un mot, fais-le deviner à la meute !',
    players: '2 à 8 joueurs',
    duration: '5 à 11 min',
    available: true,
  },
  {
    id: 'quiz',
    name: 'Quiz de la meute',
    tagline: 'Questions express, réponses en équipe.',
    players: '2 à 8 joueurs',
    duration: '5 min',
    available: false,
  },
  {
    id: 'cache',
    name: 'Cache-truffe',
    tagline: 'Retrouve l’os caché avant les autres.',
    players: '3 à 8 joueurs',
    duration: '8 min',
    available: false,
  },
]

/** Réglages de Draw It. */
export const DRAWIT = {
  minPlayers: 2,
  maxPlayers: 8,
  chooseMs: 15000,
  revealMs: 8000,
  revealShortMs: 4000,
  drawTimes: [45, 60, 90],
  tourChoices: [1, 2, 3],
  defaultDrawTime: 60,
}

export function defaultTours(playerCount) {
  return playerCount >= 6 ? 1 : 2
}

/** Durée maximale estimée d'une partie de Draw It, en secondes. */
export function drawItDuration(settings, playerCount) {
  const n = Math.max(DRAWIT.minPlayers, playerCount)
  const tours = settings.tours === 'auto' || !settings.tours ? defaultTours(n) : settings.tours
  const perRound = DRAWIT.chooseMs / 1000 + settings.drawTime + DRAWIT.revealMs / 1000
  return Math.round(tours * n * perRound)
}
