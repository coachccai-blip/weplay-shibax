// Barème de Draw It (voir brief, section « Le score »).

export const DIFFICULTIES = ['facile', 'moyen', 'difficile']

export const MULTIPLIERS = { facile: 1, moyen: 1.25, difficile: 1.5, perso: 1 }

export const FIRST_FINDER_BONUS = 20

/**
 * Points d'un devineur : 30 + 70 × temps restant ÷ temps de dessin, arrondi.
 * 100 points à la première seconde, 30 à la dernière, 65 à mi-temps.
 */
export function guesserPoints(remainingMs, drawMs) {
  if (!(drawMs > 0)) return 30
  const ratio = Math.min(1, Math.max(0, remainingMs / drawMs))
  return Math.round(30 + 70 * ratio)
}

/** Points du dessinateur : 100 × part des devineurs qui ont trouvé (3 sur 4 → 75). */
export function drawerPoints(foundCount, guesserCount) {
  if (!(guesserCount > 0)) return 0
  return Math.round((100 * Math.min(foundCount, guesserCount)) / guesserCount)
}

export function multiplierFor(difficulty) {
  return MULTIPLIERS[difficulty] ?? 1
}

/**
 * Points de chaque joueur pour une manche.
 * @param {object} p
 * @param {Array<{uid:string, at:number}>} p.finds  bonnes réponses (heure serveur)
 * @param {string|null} p.firstId                     premier à trouver (bonus)
 * @param {string} p.drawerId
 * @param {number} p.guesserCount                     devineurs éligibles
 * @param {number} p.drawStart                        début du dessin (ms)
 * @param {number} p.drawMs                           temps de dessin (ms)
 * @param {string} p.difficulty                       facile | moyen | difficile | perso
 * @param {boolean} p.drawerScores                    false si le dessinateur a passé ou est parti
 * @returns {Record<string, number>}
 */
export function roundPoints({ finds, firstId, drawerId, guesserCount, drawStart, drawMs, difficulty, drawerScores = true }) {
  const mult = multiplierFor(difficulty)
  const points = {}
  for (const f of finds) {
    const remaining = drawStart + drawMs - f.at
    let base = guesserPoints(remaining, drawMs)
    if (f.uid === firstId) base += FIRST_FINDER_BONUS
    points[f.uid] = Math.round(base * mult)
  }
  if (drawerId) {
    points[drawerId] = drawerScores ? Math.round(drawerPoints(finds.length, guesserCount) * mult) : 0
  }
  return points
}

/**
 * Classement final : score décroissant, puis nombre de mots trouvés ; égalité parfaite = rang partagé.
 * @param {Array<{uid:string, score:number, found:number}>} players
 * @returns {Array<{uid:string, score:number, found:number, rank:number}>}
 */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.found - a.found || a.uid.localeCompare(b.uid))
  let rank = 0
  return sorted.map((p, i) => {
    const prev = sorted[i - 1]
    if (!prev || prev.score !== p.score || prev.found !== p.found) rank = i + 1
    return { ...p, rank }
  })
}
