// Organisation des clés dans le magasin Blobs « weplay-shibax ».
// Les données qui grossissent (messages, réactions, traits, propositions) sont en ajout seul :
// chaque élément crée sa propre clé, personne ne réécrit l'élément d'un autre.
import { utcBucket } from '../shared/time.js'

export const K = {
  secret: () => 'cfg/secret',
  acct: (uid) => `acct/${uid}`, // compte privé (clé hachée, génération, réglages)
  user: (uid) => `user/${uid}`, // profil public + progression
  photo: (uid, v) => `photo/${uid}/${v}`, // photo de profil (image)
  urooms: (uid) => `urooms/${uid}`, // salons de l'utilisateur + curseurs de lecture
  loginFail: (uid) => `login-fail/${uid}`,
  link: (token) => `link/${token}`, // QR code de connexion (10 min)
  linkUsed: (token) => `link-used/${token}`, // usage unique
  room: (rid) => `room/${rid}`,
  roomLast: (rid) => `rlast/${rid}`, // aperçu du dernier message
  presence: (rid) => `pres/${rid}`,
  invite: (code) => `inv/${code}`,
  msgRoomPrefix: (rid) => `msg/${rid}/`,
  msgDayPrefix: (rid, day) => `msg/${rid}/${day}/`,
  msgHourPrefix: (rid, day, hour) => `msg/${rid}/${day}/${hour}/`,
  msg: (rid, id) => {
    const { day, hour } = utcBucket(msgTs(id))
    return `msg/${rid}/${day}/${hour}/${id}`
  },
  clientMsg: (rid, day, clientId) => `cid/${rid}/${day}/${clientId}`, // anti-doublon des nouveaux essais
  rxDayPrefix: (rid, day) => `rx/${rid}/${day}/`,
  rx: (rid, msgId, uid, reaction) => `rx/${rid}/${utcBucket(msgTs(msgId)).day}/${msgId}/${uid}~${reaction}`,
  rxMsgPrefix: (rid, msgId) => `rx/${rid}/${utcBucket(msgTs(msgId)).day}/${msgId}/`,
  game: (gid) => `game/${gid}`,
  roundPrefix: (gid, r) => `gx/${gid}/${r}/`,
  stroke: (gid, r, dev, seq) => `gx/${gid}/${r}/s/${dev}.${String(seq).padStart(6, '0')}`,
  guess: (gid, r, id) => `gx/${gid}/${r}/g/${id}`,
  found: (gid, r, uid) => `gx/${gid}/${r}/f/${uid}`,
  first: (gid, r) => `gx/${gid}/${r}/first`,
  tap: (gid, r, uid) => `gx/${gid}/${r}/t/${uid}`,
  answer: (gid, r, uid) => `gx/${gid}/${r}/a/${uid}`, // réponse d'un joueur (jeux par manches)
  asyncGame: (id) => `ag/${id}`, // jeu dans la conversation
  asyncIndex: (rid) => `aidx/${rid}`, // jeux de conversation d'un groupe (versions)
  asyncImage: (id) => `agimg/${id}`, // dessin de « Devine mon dessin »
  heartbeat: (gid, uid) => `hb/${gid}/${uid}`,
  drawing: (gid, r) => `img/${gid}/${r}`,
  lbWeek: (rid, week) => `lb/${rid}/w/${week}`,
  lbAll: (rid) => `lb/${rid}/all`,
  weekly: (rid, week) => `wk/${rid}/${week}`,
  fx: (gid, window) => `fx/${gid}/${window}`, // verrou des effets de fin de partie
}

/** Identifiant de message : horodatage serveur (13 chiffres) _ auteur _ aléa. Trié = chronologique. */
export function makeMsgId(ts, author, rnd) {
  return `${String(ts).padStart(13, '0')}_${author}_${rnd}`
}

export function msgTs(id) {
  return Number(String(id).slice(0, 13))
}

export function msgAuthor(id) {
  const s = String(id)
  return s.slice(14, s.lastIndexOf('_'))
}

export const MSG_ID_RE = /^\d{13}_(SHX-[A-HJ-NP-Z2-9]{6}|sys)_[a-z0-9]{4,8}$/

export function lastSegment(key) {
  return key.slice(key.lastIndexOf('/') + 1)
}
