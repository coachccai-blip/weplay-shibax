// Textes composés à partir de données structurées (messages système, aperçus, semaines),
// pour que chacun les lise dans sa langue.
import { t, tn, locale, lang } from './index.js'

const MEDALS = ['🥇', '🥈', '🥉']

export function gameName(type) {
  return t(`game.${type}.name`)
}

export function weekLabel(week) {
  if (!week) return ''
  const [y, m, d] = week.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  const loc = locale()
  const dayMonth = (dt) => dt.toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' })
  return t('week.range', { from: dayMonth(start), to: dayMonth(end) })
}

export function systemText(sys) {
  if (!sys) return ''
  switch (sys.kind) {
    case 'created':
      return t('sys.created', { pseudo: sys.pseudo, name: sys.name })
    case 'join':
      return t('sys.join', { pseudo: sys.pseudo })
    case 'leave':
      return t('sys.leave', { pseudo: sys.pseudo })
    case 'kick':
      return t('sys.kick', { pseudo: sys.pseudo })
    case 'host':
      return t('sys.host', { pseudo: sys.pseudo })
    case 'rename':
      return t('sys.rename', { name: sys.name })
    case 'weekly': {
      const podium = (sys.podium || []).map((p, i) => `${MEDALS[i] || ''} ${p.pseudo} (${p.xp} XP)`).join(' · ')
      return t('sys.weekly', { week: weekLabel(sys.week), podium })
    }
    case 'asyncResult':
      return asyncResultText(sys)
    default:
      return ''
  }
}

/** Résultat d'un jeu de conversation (« Mochi a gagné le Morpion contre Kuma »). */
export function asyncResultText(sys) {
  const game = gameName(sys.gtype)
  if (sys.outcome === 'win') return sys.others?.length ? t('async.result.win', { game, winner: sys.winner, others: sys.others.join(', ') }) : t('async.result.winSolo', { game, winner: sys.winner })
  if (sys.outcome === 'draw') return t('async.result.draw', { game, players: (sys.players || []).join(', ') })
  if (sys.outcome === 'team') return t('async.result.team', { game })
  if (sys.outcome === 'lost') return t('async.result.lost', { game })
  if (sys.outcome === 'poll') return t('async.result.poll', { game })
  return t('async.result.over', { game })
}

/** Aperçu du dernier message dans la liste des groupes. */
export function previewText(last, myId) {
  if (!last) return t('rooms.noMessage')
  if (last.type === 'text') return `${last.author === myId ? t('common.you') : last.pseudo || t('common.someone')} : ${last.text || ''}`
  if (last.type === 'sys') return systemText(last.sys)
  if (last.type === 'game') {
    const game = gameName(last.gtype)
    if (last.kind === 'results') return `🎮 ${last.winner ? t('preview.results', { game, winner: last.winner }) : t('preview.resultsNoWinner', { game })}`
    if (last.kind === 'async') return `🎲 ${t('preview.async', { pseudo: last.pseudo || t('common.someone'), game })}`
    return `🎮 ${t('preview.invite', { pseudo: last.pseudo || t('common.someone'), game })}`
  }
  return ''
}

export function membersLabel(n) {
  return tn('common.members', n)
}

/** Rang (Chiot, Jeune shiba…) d'après le niveau. */
export function rankName(level) {
  const k = level >= 30 ? 30 : level >= 20 ? 20 : level >= 10 ? 10 : level >= 5 ? 5 : 1
  return t(`rank.${k}`)
}

export const coatName = (id) => t(`coat.${id}`)
export const accName = (id) => t(`acc.${id}`)
export const badgeName = (id) => t(`badge.${id}.name`)
export const badgeDesc = (id) => t(`badge.${id}.desc`)

/** Ligne du détail de l'XP gagnée (clé + paramètres calculés par le serveur). */
export function xpLineText(line) {
  return t(`xp.${line.key}`, line)
}

/** Rang d'arrivée : « 1er, 2e » / « 1st, 2nd ». */
export function ordinal(n) {
  if (lang.value === 'en') {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
  }
  return n === 1 ? '1er' : `${n}e`
}
