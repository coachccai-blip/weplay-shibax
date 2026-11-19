// XP, niveaux, rangs, accessoires et badges (calculés côté serveur, affichés côté client).

/** XP pour passer du niveau n au suivant : 100 + 25 × (n − 1). */
export function xpToNext(level) {
  return 100 + 25 * (level - 1)
}

/** XP cumulée nécessaire pour atteindre un niveau (niveau 2 : 100, niveau 10 : 1 800). */
export function totalXpForLevel(level) {
  const n = level - 1
  return 100 * n + (25 * n * (n - 1)) / 2
}

export function levelFromXp(xp) {
  let level = 1
  while (totalXpForLevel(level + 1) <= xp) level++
  const base = totalXpForLevel(level)
  const next = totalXpForLevel(level + 1)
  return { level, into: xp - base, needed: next - base, progress: (xp - base) / (next - base) }
}

export const RANKS = [
  { min: 1, name: 'Chiot' },
  { min: 5, name: 'Jeune shiba' },
  { min: 10, name: 'Shiba futé' },
  { min: 20, name: 'Shiba doré' },
  { min: 30, name: 'Shibax légendaire' },
]

export function rankFor(level) {
  let r = RANKS[0]
  for (const rank of RANKS) if (level >= rank.min) r = rank
  return r.name
}

export const COATS = [
  { id: 'roux', name: 'Roux' },
  { id: 'creme', name: 'Crème' },
  { id: 'sesame', name: 'Sésame' },
  { id: 'noir', name: 'Noir et feu' },
]
export const COAT_IDS = COATS.map((c) => c.id)

/** Accessoires débloqués par niveau ; un seul par emplacement. */
export const ACCESSORIES = [
  { id: 'bandana', name: 'Bandana', level: 5, slot: 'cou' },
  { id: 'lunettes', name: 'Lunettes rondes', level: 10, slot: 'yeux' },
  { id: 'beret', name: 'Béret', level: 15, slot: 'tete' },
  { id: 'echarpe', name: 'Écharpe', level: 20, slot: 'cou' },
  { id: 'couronne', name: 'Couronne', level: 30, slot: 'tete' },
]

export function unlockedAccessories(level) {
  return ACCESSORIES.filter((a) => level >= a.level).map((a) => a.id)
}

/** Garde les accessoires débloqués, un par emplacement (le dernier choisi l'emporte). */
export function sanitizeAccessories(list, level) {
  const allowed = new Set(unlockedAccessories(level))
  const bySlot = new Map()
  for (const id of Array.isArray(list) ? list : []) {
    const acc = ACCESSORIES.find((a) => a.id === id)
    if (acc && allowed.has(id)) bySlot.set(acc.slot, id)
  }
  return [...bySlot.values()]
}

export const BADGES = [
  { id: 'premiere_patte', name: 'Première patte', desc: 'Terminer sa première partie', icon: 'paw' },
  { id: 'flair', name: 'Flair infaillible', desc: 'Trouver un mot en moins de 5 secondes', icon: 'nose' },
  { id: 'picasshiba', name: 'Picasshiba', desc: 'Faire deviner son dessin à tous les joueurs', icon: 'brush' },
  { id: 'sans_faute', name: 'Sans faute', desc: 'Trouver tous les mots d’une partie', icon: 'target' },
  { id: 'mot_maison', name: 'Mot maison', desc: 'Faire deviner un mot perso à tous les joueurs', icon: 'house' },
  { id: 'chef_de_meute', name: 'Chef de meute', desc: 'Gagner 10 parties', icon: 'crown' },
  { id: 'fidele', name: 'Fidèle', desc: 'Jouer 7 jours de suite', icon: 'calendar' },
  { id: 'marathonien', name: 'Marathonien', desc: 'Terminer 50 parties', icon: 'medal' },
  { id: 'pipelette', name: 'Pipelette', desc: 'Envoyer 100 messages', icon: 'bubble' },
  { id: 'hote_en_or', name: 'Hôte en or', desc: 'Créer un salon rejoint par 3 personnes', icon: 'star' },
]

export const PODIUM_XP = { 1: 30, 2: 20, 3: 10 }
export const XP_GAME_FINISHED = 20
export const XP_FIRST_GAME_OF_DAY = 15
export const MIN_ROUNDS_FOR_XP = 3

/** Bonus de série : +10 % par jour consécutif au-delà du premier, plafonné à +50 %. */
export function streakBonusPercent(streak) {
  return Math.min(50, Math.max(0, 10 * (streak - 1)))
}

/**
 * XP gagnée dans une partie.
 * @returns {{ total:number, lines:Array<{label:string, xp:number}> }}
 */
export function computeGameXp({ valid, finished, points, rank, firstGameOfDay, streak }) {
  if (!valid) return { total: 0, lines: [] }
  const lines = []
  if (finished) lines.push({ label: 'Partie terminée', xp: XP_GAME_FINISHED })
  const fromPoints = Math.floor(Math.max(0, points) / 10)
  if (fromPoints > 0) lines.push({ label: `Points marqués (${points})`, xp: fromPoints })
  if (PODIUM_XP[rank]) lines.push({ label: `Podium : ${rank === 1 ? '1er' : `${rank}e`}`, xp: PODIUM_XP[rank] })
  if (firstGameOfDay) lines.push({ label: 'Première partie du jour', xp: XP_FIRST_GAME_OF_DAY })
  const base = lines.reduce((s, l) => s + l.xp, 0)
  const pct = streakBonusPercent(streak)
  const bonus = Math.round((base * pct) / 100)
  if (bonus > 0) lines.push({ label: `Série de ${streak} jours (+${pct} %)`, xp: bonus })
  return { total: base + bonus, lines }
}

/** Série affichée : elle tient si la dernière partie date d'aujourd'hui ou d'hier. */
export function currentStreak(streak, todayDiff) {
  if (!streak || !streak.count) return 0
  return todayDiff <= 1 ? streak.count : 0
}
