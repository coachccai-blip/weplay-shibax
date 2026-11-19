// Règles et limites communes à l'interface et aux Functions.

export const LIMITS = {
  pseudoMin: 3,
  pseudoMax: 16,
  roomNameMin: 3,
  roomNameMax: 30,
  roomMaxMembers: 20,
  maxGroupsPerUser: 50, // groupes qu'un compte peut créer ou rejoindre
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

/**
 * Catalogue du hub (noms, accroches et règles : traductions « game.<id>.* » côté interface).
 * `mode` : « sync » = en direct, tout le monde au même moment (lobby puis partie) ;
 * « async » = dans la conversation, chacun joue à son rythme depuis la carte du fil.
 */
export const GAME_CATALOG = [
  { id: 'drawit', mode: 'sync', emoji: '🎨', min: 2, max: 8, minutes: [5, 11] },
  { id: 'quiz', mode: 'sync', emoji: '❓', min: 2, max: 8, minutes: [3, 5] },
  { id: 'reflexe', mode: 'sync', emoji: '⚡', min: 2, max: 8, minutes: [1, 2] },
  { id: 'justenombre', mode: 'sync', emoji: '🎯', min: 2, max: 8, minutes: [2, 4] },
  { id: 'petitbac', mode: 'sync', emoji: '📝', min: 2, max: 8, minutes: [4, 8] },
  { id: 'calcul', mode: 'sync', emoji: '🧮', min: 2, max: 8, minutes: [2, 4] },
  { id: 'anagramme', mode: 'sync', emoji: '🔤', min: 2, max: 8, minutes: [2, 4] },
  { id: 'dessin', mode: 'async', emoji: '🖌️', min: 2, max: 20, hours: 24 },
  { id: 'morpion', mode: 'async', emoji: '❌', min: 2, max: 2, hours: 168, duel: true },
  { id: 'puissance4', mode: 'async', emoji: '🔴', min: 2, max: 2, hours: 168, duel: true },
  { id: 'shifumi', mode: 'async', emoji: '✊', min: 2, max: 2, hours: 72, duel: true },
  { id: 'tupreferes', mode: 'async', emoji: '🤔', min: 2, max: 20, hours: 24 },
  { id: 'pendu', mode: 'async', emoji: '🪢', min: 1, max: 20, hours: 72 },
  { id: 'devine', mode: 'async', emoji: '🔢', min: 1, max: 20, hours: 48 },
]
/** Jeux en direct « par manches » : nombres de manches proposés et valeur par défaut. */
export const LIVE_ROUNDS = {
  quiz: { choices: [5, 10, 15], def: 10, content: true },
  reflexe: { choices: [5, 8, 10], def: 8, content: false },
  justenombre: { choices: [4, 6, 8], def: 6, content: true },
  petitbac: { choices: [3, 4, 5], def: 3, content: true },
  calcul: { choices: [8, 10, 15], def: 10, content: false },
  anagramme: { choices: [5, 8, 10], def: 6, content: true },
}
/** Catégories du quiz (data/quiz.json), au choix de l'hôte dans le lobby. */
export const QUIZ_CATS = ['animaux', 'geo', 'science', 'nature', 'cuisine', 'sport', 'culture', 'corps']

export const SYNC_GAMES = GAME_CATALOG.filter((g) => g.mode === 'sync').map((g) => g.id)
export const ASYNC_GAME_IDS = GAME_CATALOG.filter((g) => g.mode === 'async').map((g) => g.id)

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
