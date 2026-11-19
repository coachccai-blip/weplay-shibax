// Jeux en direct branchés sur le cadre commun (lobby, déroulé, score, récompenses, cartes du fil).
// Ajouter un jeu : ses règles côté serveur (server/games/) + son écran ici + ses textes (src/i18n).
// Les jeux « dans la conversation » ont leurs cartes dans src/games/async/.
import { DrawIt } from './drawit/DrawIt.js'
import { TestGame } from './test/TestGame.js'
import { LiveGame } from './live/LiveGames.js'

export const GAME_UI = {
  drawit: DrawIt,
  quiz: LiveGame,
  reflexe: LiveGame,
  justenombre: LiveGame,
  petitbac: LiveGame,
  calcul: LiveGame,
  anagramme: LiveGame,
  test: TestGame,
}
