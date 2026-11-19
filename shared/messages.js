// Textes des messages système et aperçus (utilisés par le serveur et l'interface).

const medal = ['🥇', '🥈', '🥉']

export function systemText(sys) {
  if (!sys) return ''
  switch (sys.kind) {
    case 'created':
      return `${sys.pseudo} a créé le salon « ${sys.name} ». Bienvenue !`
    case 'join':
      return `${sys.pseudo} a rejoint le salon.`
    case 'leave':
      return `${sys.pseudo} a quitté le salon.`
    case 'kick':
      return `${sys.pseudo} a été retiré du salon.`
    case 'host':
      return `${sys.pseudo} est maintenant l’hôte du salon.`
    case 'rename':
      return `Le salon s’appelle maintenant « ${sys.name} ».`
    case 'weekly': {
      const podium = (sys.podium || []).map((p, i) => `${medal[i] || ''} ${p.pseudo} (${p.xp} XP)`).join(' · ')
      return `Podium de la semaine ${sys.label || ''} : ${podium}. Bien joué, la meute !`
    }
    default:
      return ''
  }
}

export function gameCardText(msg, gameName = 'Draw It') {
  if (msg.kind === 'results') {
    const winner = msg.podium?.[0]
    return winner ? `Résultats de ${gameName} : ${winner.pseudo} l’emporte !` : `Résultats de ${gameName}`
  }
  return `${msg.a?.p || 'Quelqu’un'} lance une partie de ${gameName}`
}

/** Aperçu court d'un message pour la liste des salons. */
export function previewOf(msg, gameName) {
  if (!msg) return ''
  if (msg.type === 'text') return String(msg.text || '').replace(/\s+/g, ' ').slice(0, 90)
  if (msg.type === 'sys') return systemText(msg.sys).slice(0, 90)
  if (msg.type === 'game') return `🎮 ${gameCardText(msg, gameName)}`.slice(0, 90)
  return ''
}
