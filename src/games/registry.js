// Jeux branchés sur le cadre commun (lobby, déroulé, score, récompenses, cartes du fil).
// Ajouter un jeu : ses règles côté serveur (server/games/) + son écran ici.
import { DrawIt } from './drawit/DrawIt.js'
import { TestGame } from './test/TestGame.js'

export const GAME_UI = {
  drawit: DrawIt,
  test: TestGame,
}
