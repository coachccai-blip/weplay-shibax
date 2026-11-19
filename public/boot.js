// Garde-fou de démarrage : si l'application ne s'est pas lancée après 12 s
// (navigateur trop ancien, déploiement incomplet, réseau coupé), on explique quoi faire.
;(function () {
  var started = Date.now()
  window.__shxBooted = false
  function check() {
    if (window.__shxBooted) return
    var el = document.getElementById('boot-text')
    if (!el) return
    if (Date.now() - started < 12000) return setTimeout(check, 1000)
    el.innerHTML =
      'Le chargement prend plus de temps que prévu.<br>' +
      'Vérifie ta connexion puis <a href="/">recharge la page</a>.<br><small>' +
      'Si tu viens de déployer le site : connecte-toi à Netlify avant de déposer le dossier, ' +
      'pour que Netlify construise le site et active les Functions.</small>'
  }
  setTimeout(check, 1000)
})()
