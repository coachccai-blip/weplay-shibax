// Routage par fragment (#/…) : chaque salon et chaque partie a sa propre adresse,
// le bouton retour du navigateur fonctionne partout, sans règle de réécriture côté serveur.
import { signal } from '@preact/signals'

const ROUTES = [
  ['home', /^\/?$/],
  ['room', /^\/salon\/([a-z0-9]+)\/?$/],
  ['hub', /^\/salon\/([a-z0-9]+)\/jouer\/?$/],
  ['game', /^\/salon\/([a-z0-9]+)\/partie\/([0-9]{8}-[a-z0-9]+)\/?$/],
  ['profile', /^\/profil\/?$/],
  ['join', /^\/rejoindre\/([A-Za-z0-9]+)\/?$/],
  ['link', /^\/connexion\/([A-Za-z0-9]+)\/?$/],
  ['login', /^\/compte\/?$/],
  ['privacy', /^\/confidentialite\/?$/],
]

export function parse(hash) {
  const path = decodeURIComponent(String(hash || '').replace(/^#/, '')) || '/'
  for (const [name, re] of ROUTES) {
    const m = re.exec(path)
    if (m) {
      const params = {}
      if (name === 'room' || name === 'hub') params.rid = m[1]
      if (name === 'game') Object.assign(params, { rid: m[1], gid: m[2] })
      if (name === 'join') params.code = m[1].toUpperCase()
      if (name === 'link') params.token = m[1]
      return { name, params, path }
    }
  }
  return { name: 'home', params: {}, path: '/' }
}

export const route = signal(parse(typeof location !== 'undefined' ? location.hash : ''))
let depth = 0

window.addEventListener('hashchange', () => {
  route.value = parse(location.hash)
})

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`
  if (location.hash === target) {
    route.value = parse(target)
    return
  }
  if (replace) {
    history.replaceState(null, '', target)
    route.value = parse(target)
  } else {
    depth++
    location.hash = path
  }
}

/** Retour : historique du navigateur si on a navigué dans l'appli, sinon l'écran parent. */
export function back(fallback = '/') {
  if (depth > 0) {
    depth--
    history.back()
  } else navigate(fallback, { replace: true })
}

export const paths = {
  home: () => '/',
  room: (rid) => `/salon/${rid}`,
  hub: (rid) => `/salon/${rid}/jouer`,
  game: (rid, gid) => `/salon/${rid}/partie/${gid}`,
  profile: () => '/profil',
  join: (code) => `/rejoindre/${code}`,
  login: () => '/compte',
  privacy: () => '/confidentialite',
}

export function absoluteUrl(path) {
  return `${location.origin}/#${path}`
}
