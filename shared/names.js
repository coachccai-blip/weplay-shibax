// Tirage au sort des pseudos (« Mochi Malicieux », « Sneaky Mochi ») et des pelages.
import { COAT_IDS } from './progression.js'

const NAMES = [
  'Mochi', 'Yuzu', 'Kuma', 'Miso', 'Tofu', 'Dango', 'Matcha', 'Wasabi', 'Kiwi', 'Biscuit', 'Caramel', 'Nougat',
  'Cookie', 'Muffin', 'Bento', 'Taiyaki', 'Sésame', 'Shiro', 'Kuro', 'Kinako', 'Azuki', 'Ramen', 'Sushi', 'Udon',
  'Daifuku', 'Pocky', 'Moka', 'Pistou', 'Praliné', 'Grelot', 'Nuage', 'Pompon', 'Flocon', 'Gribouille', 'Plume',
  'Chamallow', 'Pancake', 'Gaufre', 'Marron', 'Litchi', 'Mango', 'Hibiscus', 'Haïku', 'Bonsaï', 'Origami',
]

const NAMES_EN = [
  'Mochi', 'Yuzu', 'Kuma', 'Miso', 'Tofu', 'Dango', 'Matcha', 'Wasabi', 'Kiwi', 'Biscuit', 'Caramel', 'Nugget',
  'Cookie', 'Muffin', 'Bento', 'Taiyaki', 'Sesame', 'Shiro', 'Kuro', 'Kinako', 'Azuki', 'Ramen', 'Sushi', 'Udon',
  'Daifuku', 'Pocky', 'Mocha', 'Pebble', 'Pretzel', 'Peanut', 'Cloud', 'Pompom', 'Snowflake', 'Doodle', 'Feather',
  'Marshmallow', 'Pancake', 'Waffle', 'Chestnut', 'Lychee', 'Mango', 'Hibiscus', 'Haiku', 'Bonsai', 'Origami',
]

const ADJECTIVES = [
  'Malicieux', 'Joyeux', 'Curieux', 'Rusé', 'Câlin', 'Rapide', 'Farceur', 'Gourmand', 'Rêveur', 'Pétillant',
  'Moelleux', 'Espiègle', 'Taquin', 'Vaillant', 'Zen', 'Filou', 'Malin', 'Fougueux', 'Radieux', 'Sage', 'Futé',
  'Agile', 'Doux', 'Mignon', 'Rigolo', 'Joueur', 'Royal', 'Cosmique', 'Magique', 'Héroïque', 'Discret', 'Sportif',
  'Créatif', 'Pensif', 'Habile', 'Fidèle', 'Loyal', 'Brave', 'Têtu', 'Serein', 'Dodu', 'Chic', 'Poli', 'Tonique',
  'Gentil', 'Coquin', 'Intrépide', 'Énergique', 'Pimpant', 'Flâneur', 'Bavard', 'Dormeur', 'Sautillant', 'Rieur',
]

const ADJECTIVES_EN = [
  'Sneaky', 'Happy', 'Curious', 'Clever', 'Cuddly', 'Speedy', 'Cheeky', 'Hungry', 'Dreamy', 'Bubbly', 'Fluffy',
  'Playful', 'Brave', 'Zen', 'Witty', 'Jolly', 'Sunny', 'Wise', 'Nimble', 'Gentle', 'Cute', 'Silly', 'Royal',
  'Cosmic', 'Magic', 'Heroic', 'Quiet', 'Sporty', 'Crafty', 'Loyal', 'Bold', 'Stubborn', 'Calm', 'Chubby',
  'Fancy', 'Polite', 'Peppy', 'Kind', 'Daring', 'Lively', 'Chatty', 'Sleepy', 'Bouncy', 'Giggly', 'Lucky',
]

function pick(list) {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return list[buf[0] % list.length]
}

/** Pseudo aléatoire de 3 à 16 caractères, dans la langue choisie. */
export function randomPseudo(lang = 'fr') {
  for (let i = 0; i < 60; i++) {
    const p = lang === 'en' ? `${pick(ADJECTIVES_EN)} ${pick(NAMES_EN)}` : `${pick(NAMES)} ${pick(ADJECTIVES)}`
    if (p.length <= 16) return p
  }
  return pick(lang === 'en' ? NAMES_EN : NAMES)
}

export function randomCoat() {
  return pick(COAT_IDS)
}
