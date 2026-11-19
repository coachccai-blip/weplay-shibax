# Weplay Shibax

Chat entre amis et mini-jeux dans un univers shiba pastel. On discute dans des salons privés, on lance **Draw It** depuis la conversation (un joueur dessine, les autres devinent), et on gagne de l'XP, des badges et des accessoires pour son shiba.

Tout tourne sur **Netlify** : le site (Vite + Preact), l'API (**Netlify Functions**) et les données (**Netlify Blobs**). Aucune base de données ni service externe à configurer.

---

## Déployer par glisser-déposer (Netlify Drop)

1. **Connecte-toi** à ton compte sur [app.netlify.com](https://app.netlify.com). C'est indispensable : connecté, Netlify **construit** le projet (installation, `npm run build`) et **active les Functions**. Déposé sans être connecté, le dossier serait publié tel quel, sans serveur.
2. Ouvre **Netlify Drop** (`app.netlify.com/drop`) ou, dans ton équipe : *Add new project › Deploy manually*.
3. **Glisse le fichier `weplay-shibax-netlify.zip`** (ou le dossier décompressé) dans la zone de dépôt.
4. Netlify détecte un projet Vite, lit `netlify.toml`, installe les dépendances, construit `dist/` et déploie trois Functions :
   - `api` : toute l'API, sur `/api/*` ;
   - `cleanup` : ménage quotidien (messages de plus de 90 jours, dessins de plus de 30 jours) ;
   - `weekly-podium` : podium de la semaine annoncé chaque lundi dans les salons.
5. Ouvre l'adresse du site : un compte est créé automatiquement à la première visite.

Netlify Blobs est activé automatiquement pour le site (magasin `weplay-shibax`), rien à configurer.

**Mettre à jour le site** : dépose le nouveau zip dans l'onglet *Deploys* du projet. Chaque déploiement de production coûte 15 crédits sur l'offre Free (300 par mois) : teste plutôt en local (voir plus bas).

**Si la page reste bloquée sur « Le shiba remue la queue… »** ou affiche « Le serveur de l'application ne répond pas » : le dépôt a été publié sans construction. Connecte-toi et dépose le zip à nouveau.

**Alternatives** : relier ce dépôt GitHub à Netlify (déploiement continu, même configuration), ou en ligne de commande depuis le dossier : `npx netlify-cli deploy --build --prod`.

### Réglages facultatifs (variables d'environnement Netlify)

| Variable | Rôle |
| --- | --- |
| `SHX_SECRET` | Secret de signature des sessions. Facultatif : sinon il est généré une fois et conservé dans Blobs. |
| `SHX_BLOBS_REGION` | Région du magasin Blobs (`us-east-2` par défaut, comme les Functions). Avec une offre Pro et des Functions à Francfort (`fra`), mettre `eu-central-1` **avant** la mise en production : les données ne migrent pas d'une région à l'autre. |
| `SHX_ENABLE_TEST_GAME` | `1` pour activer le jeu factice des tests automatisés (désactivé en production). |

---

## Ce que fait l'application (V1 du brief)

- **Compte sans inscription** : identifiant `SHX-XXXXXX`, pseudo et shiba tirés au sort, clé de connexion de 12 caractères (stockée hachée). Reprise sur un autre appareil par **QR code** (10 minutes, usage unique) ou par **identifiant + clé**. Régénérer la clé déconnecte les autres appareils.
- **Salons privés** : lien d'invitation + code à 6 caractères, 20 membres, hôte (renommer, retirer un membre, réinitialiser l'invitation), présence (actifs dans les 30 s), non lus, séparateur « Nouveaux messages », historique paginé (50 par 50), réactions illustrées par le shiba, envoi optimiste avec « Réessayer », anti-rafale (5 messages / 5 s).
- **Hub de jeux** : Draw It jouable, deux cartes « Bientôt ».
- **Cadre de jeu commun** : lobby (réglages, durée estimée, « Lancer »), une seule partie active par salon, hôte transmis s'il part, lobby annulé après 10 min, cartes d'invitation (statut en direct) et de résultats dans le fil, « Rejouer » avec les mêmes joueurs et réglages.
- **Draw It** : choix du mot (facile / moyen / difficile, ou mot perso), dessin en direct sur une zone 4:3 identique partout, 12 couleurs, 3 épaisseurs, gomme, annuler, tout effacer, « Passer », indices (cases, lettres dévoilées à 1/2 et 3/4 du temps), propositions (accents, majuscules, traits d'union ignorés ; « Tu chauffes ! » ; propositions contenant le mot masquées), barème du brief, podium et miniatures des dessins.
- **Gamification** : XP (partie, points, podium, première partie du jour, bonus de série), niveaux (100 + 25 × (n − 1)), rangs, 5 accessoires, 10 badges, série quotidienne à l'heure de Paris, classement du salon (semaine et depuis toujours), podium hebdomadaire. Célébrations : saut et vibration à la bonne réponse, confettis pastel, écran de passage de niveau, carte qui se retourne pour chaque badge, sons courts (désactivables).
- **Interface** : français et tutoiement, mobile d'abord (un écran + onglets), tablette (2 colonnes, liste repliable), PC (3 colonnes ; en partie, le jeu au centre et les propositions à droite), une adresse par salon et par partie (le bouton retour fonctionne), ajout à l'écran d'accueil (PWA avec l'icône du logo), « Réduire les animations » (suit le système par défaut), cibles tactiles de 44 px, navigation clavier, information jamais portée par la couleur seule.

## Cadre technique

```
index.html, src/          Interface (Vite + Preact/htm + signals)
  lib/transport.js        Module de transport unique (règle 7) : requêtes + interrogation adaptative
  state/                  État : session, salons, partie, plan d'interrogation
  screens/, games/        Écrans ; jeux branchés sur le cadre commun
  components/Shiba.js     Mascotte vectorielle originale (4 pelages, expressions, accessoires)
public/                   Logo, icônes PWA, polices Fredoka et Nunito (auto-hébergées), service worker
netlify/functions/        api.mjs (/api/*), cleanup.mjs (@daily), weekly-podium.mjs (lundi)
server/                   Règles serveur : comptes, salons, messages, jeux, récompenses, Blobs
shared/                   Logique commune client/serveur : comparaison des mots, barème, XP, heure de Paris
data/mots.json            Banque de 300 mots (6 thèmes × 3 difficultés), séparée du code
tests/                    Tests unitaires, d'intégration (API) et de bout en bout (3 navigateurs)
```

Les huit règles du brief :

1. **Le serveur fait foi** : le mot secret n'est envoyé qu'au dessinateur (vues filtrées par joueur) ; propositions, points, XP et échéances sont calculés dans la Function avec l'heure du serveur.
2. **Interrogation adaptative** : une seule requête `POST /api/sync` toutes les secondes en partie, toutes les 3 s dans un salon, 5 s ailleurs ; en pause onglet masqué, rattrapage en une requête au retour. Chaque réponse ne renvoie que les nouveautés (curseurs par salon, par appareil de dessin, par proposition).
3. **Écritures en ajout seul** : chaque message, lot de traits, proposition, bonne réponse et réaction crée sa propre clé.
4. **Transitions conditionnelles** : créations avec `onlyIfNew` (premier à trouver, verrous) et changements d'état par écriture conditionnelle sur l'ETag (`onlyIfMatch`) : une seule requête fait avancer la partie ; c'est la première interrogation reçue après une échéance qui la déclenche.
5. **Cohérence forte** pour toutes les lectures (`consistency: 'strong'`).
6. **Même région** pour Functions et Blobs (valeurs par défaut ; voir `SHX_BLOBS_REGION`).
7. **Transport isolé** : `src/lib/transport.js` peut être remplacé par des WebSockets sans toucher aux règles.
8. **Secrets** : clé de connexion hachée (scrypt), jeton de session signé (HMAC) vérifié à chaque appel.

### Budget Netlify (estimation)

- Partie de Draw It de 10 min à 4 : environ 2 400 interrogations + 1 000 lots de traits ≈ 3 400 requêtes, soit 2 à 3 crédits calcul compris.
- Une heure de chat à 4 : environ 4 800 interrogations (une toutes les 3 s par personne) ≈ 1 crédit de requêtes + 1 à 2 crédits de calcul. À vérifier dans *Usage* du tableau de bord Netlify après une heure réelle.

---

## Développement local

Prérequis : Node.js 22.12 ou plus récent.

```bash
npm install
npm install -g netlify-cli
SHX_ENABLE_TEST_GAME=1 netlify dev
```

L'application est servie sur `http://localhost:8888` (Vite + Functions + un magasin Blobs local). Ouvre plusieurs navigateurs (ou une fenêtre privée) pour jouer à plusieurs.

## Tests

```bash
npm test             # tests unitaires : barème, comparaison des mots, XP, série, règles de Draw It, concurrence Blobs, idempotence des récompenses
npm run check:words  # vérification de la banque de mots
npm run test:api     # intégration (netlify dev lancé avec SHX_ENABLE_TEST_GAME=1)
npm run test:e2e     # parcours type sur 3 navigateurs : PC, téléphone, tablette (Playwright)
```

Résultats obtenus en local : 33 tests unitaires, 16 tests d'intégration (dont 20 messages simultanés depuis 4 appareils, partie complète sans fuite du mot secret, XP non attribuée deux fois) et le parcours type complet sur 3 appareils (message reçu en moins de 2 s, dessin affiché chez les devineurs en 0,7 à 1 s).

Bon à savoir : le magasin Blobs local de `netlify dev` ne renvoie pas d'ETag en lecture ; les écritures conditionnelles (`onlyIfMatch`) y sont donc moins strictes qu'en production. Les tests unitaires couvrent ces écritures avec un magasin en mémoire fidèle.

## Crédits

- Logo : fourni pour le projet (`logo_weplay_shibax.png`), décliné en icônes par `scripts/make-icons.py`.
- Polices Fredoka et Nunito : SIL Open Font License (`public/fonts/`).
- Bibliothèques : Preact (MIT), htm (Apache-2.0), @preact/signals (MIT), uqr (MIT), @netlify/blobs (MIT), Vite (MIT).
