// Garde-fou de démarrage : si l'application ne s'est pas lancée après 12 s
// (navigateur trop ancien, déploiement incomplet, réseau coupé), on explique quoi faire (FR / EN).
;(function () {
  var started = Date.now()
  window.__shxBooted = false
  function lang() {
    try {
      var saved = localStorage.getItem('shx.lang')
      if (saved) return JSON.parse(saved) === 'en' ? 'en' : 'fr'
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'fr'
    return /^en\b/i.test(nav) ? 'en' : 'fr'
  }
  var TEXT = {
    fr:
      'Le chargement prend plus de temps que prévu.<br>' +
      'Vérifie ta connexion puis <a href="/">recharge la page</a>.<br><small>' +
      'Si tu viens de déployer le site : connecte-toi à Netlify avant de déposer le dossier, ' +
      'pour que Netlify construise le site et active les Functions.</small>',
    en:
      'Loading is taking longer than expected.<br>' +
      'Check your connection, then <a href="/">reload the page</a>.<br><small>' +
      'If you have just deployed the site: log in to Netlify before dropping the folder, ' +
      'so that Netlify builds the site and turns on the Functions.</small>',
  }
  function check() {
    if (window.__shxBooted) return
    var el = document.getElementById('boot-text')
    if (!el) return
    if (Date.now() - started < 12000) return setTimeout(check, 1000)
    el.innerHTML = TEXT[lang()]
  }
  setTimeout(check, 1000)
})()
