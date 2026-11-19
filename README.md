# Weplay Shibax

Chat entre amis et **14 mini-jeux** dans un univers shiba pastel, **en français et en anglais**. On discute dans des **groupes privés** (autant qu'on veut, jusqu'à 50 par compte), on joue **en direct** (lobby, chrono, scores) ou **à son rythme dans la conversation** (une carte jouable dans le fil), et on gagne de l'XP, des badges et des accessoires pour son shiba. Le même compte fonctionne sur le **téléphone et le PC**, et chaque joueur peut ajouter une **photo** visible des membres de ses groupes.

Tout tourne sur **Netlify** : le site (Vite + Preact), l'API (**Netlify Functions**) et les données (**Netlify Blobs**). Aucune base de données ni service externe à configurer.

---

## Déployer par glisser-déposer (Netlify Drop)

1. **Connecte-toi** à ton compte sur [app.netlify.com](https://app.netlify.com). C'est indispensable : connecté, Netlify **construit** le projet (installation, `npm run build`) et **active les Functions**. Déposé sans être connecté, le dossier serait publié tel quel, sans serveur.
2. Ouvre **Netlify Drop** (`app.netlify.com/drop`) ou, dans ton équipe : *Add new project › Deploy manually*.
3. **Glisse le fichier `weplay-shibax-netlify.zip`** (ou le dossier décompressé) dans la zone de dépôt.
4. Netlify détecte un projet Vite, lit `netlify.toml`, installe les dépendances, construit `dist/` et déploie trois Functions :
   - `api` : toute l'API, sur `/api/*` ;
   - `cleanup` : ménage quotidien (messages de plus de 90 jours, dessins et jeux de conversation de plus de 30 jours) ;
   - `weekly-podium` : podium de la semaine annoncé chaque lundi dans les groupes.
5. Ouvre l'adresse du site : un compte est créé automatiquement à la première visite, dans la langue du navigateur.

Netlify Blobs est activé automatiquement pour le site (magasin `weplay-shibax`), rien à configurer.

**Mettre à jour un site déjà en ligne (v1 → v2)** : dépose le nouveau zip dans l'onglet *Deploys* du même projet. Les comptes, salons (devenus « groupes »), messages et progressions sont conservés. Chaque déploiement de production coûte 15 crédits sur l'offre Free (300 par mois) : teste plutôt en local (voir plus bas).

**Si la page reste bloquée sur « Le shiba remue la queue… »** ou affiche « Le serveur de l'application ne répond pas » : le dépôt a été publié sans construction. Connecte-toi et dépose le zip à nouveau.

**Alternatives** : relier ce dépôt GitHub à Netlify (déploiement continu, même configuration), ou en ligne de commande depuis le dossier : `npx netlify-cli deploy --build --prod`.

### Réglages facultatifs (variables d'environnement Netlify)

| Variable | Rôle |
| --- | --- |
| `SHX_SECRET` | Secret de signature des sessions et des liens de photos. Facultatif : sinon il est généré une fois et conservé dans Blobs. |
| `SHX_BLOBS_REGION` | Région du magasin Blobs (`us-east-2` par défaut, comme les Functions). Avec une offre Pro et des Functions à Francfort (`fra`), mettre `eu-central-1` **avant** la mise en production : les données ne migrent pas d'une région à l'autre. |
| `SHX_ENABLE_TEST_GAME` | `1` pour activer le jeu factice des tests automatisés (désactivé en production). |

---

## Ce que fait l'application

### Comptes, groupes, appareils

- **Compte sans inscription** : identifiant `SHX-XXXXXX`, pseudo et shiba tirés au sort (dans la langue de l'appareil), clé de connexion de 12 caractères (stockée hachée).
- **Plusieurs groupes** : on en crée et on en rejoint autant qu'on veut (50 par compte, 20 membres par groupe), chacun avec son lien d'invitation et son code à 6 caractères, son hôte, ses non lus, son classement et ses jeux. La liste « Mes groupes » affiche le dernier message de chacun.
- **Téléphone + PC** : un QR code (10 minutes, usage unique) ou l'identifiant + la clé relient un autre appareil au même compte. Sur PC, une carte propose de relier son téléphone. Le profil liste les **appareils connectés** (type, navigateur, dernière activité) et permet de **déconnecter les autres**. Pseudo, photo, langue et réglages changés sur un appareil s'appliquent à l'autre en quelques secondes ; messages, non lus et jeux sont communs.
- **Photo de profil** : choisie depuis la galerie ou l'appareil photo, recadrée en carré (glisser, zoomer), réduite à 320 × 320 (WebP, ou JPEG si le navigateur ne sait pas l'encoder). Elle s'affiche à côté du pseudo dans les messages, les jeux, les lobbys et les classements, **uniquement pour les membres des groupes du joueur** : l'adresse de l'image est signée et expire (2 semaines, renouvelée automatiquement), et seuls les membres d'un groupe la reçoivent. Sans photo, c'est le shiba qui s'affiche.

### Français et anglais

- Toute l'interface, les messages système, les erreurs du serveur, les cartes de jeu et la page de confidentialité existent dans les deux langues (`src/i18n/fr.js` et `en.js`, mêmes clés, vérifiées par les tests).
- La langue suit le navigateur à la première visite, se change dans l'accueil ou le profil, et est **enregistrée sur le compte** : le téléphone et le PC passent dans la même langue.
- Les textes produits par le serveur (« Mochi a rejoint le groupe », résultats, podium de la semaine) sont stockés sous forme de données et rédigés par chaque appareil dans **sa** langue : dans un même groupe, chacun lit le fil dans la sienne.
- Le contenu des jeux (mots, questions, dilemmes, catégories) existe en français et en anglais ; l'hôte choisit la langue du contenu dans le lobby.

### Les 14 jeux

Le bouton « Jouer » ouvre le hub, organisé en **deux onglets** pour filtrer d'un geste : **Direct** et **Asynchrone**. Chaque onglet affiche son nombre de jeux ; l'onglet Asynchrone signale par une pastille les jeux qui attendent ton coup et liste les **jeux en cours dans le groupe** (un toucher ramène à la carte dans la conversation). Le dernier onglet utilisé est retenu sur l'appareil. Sur téléphone, les tuiles passent en liste compacte.

**Direct** (tout le monde en même temps : lobby, réglages, chrono et barre de temps calés sur le serveur, « 2/4 ont répondu » en direct, révélation avec compte à rebours de la manche suivante, podium et XP) :

| Jeu | Principe et nouveautés |
| --- | --- |
| Draw It | Un joueur dessine un mot (facile / moyen / difficile ou mot perso), les autres devinent dans le chat. « Autres mots » une fois par tour, compteur « 2/3 ont trouvé ». |
| Quiz de la meute | 4 réponses, 15 s, bonus de vitesse **et de série** (+10 par bonne réponse d'affilée). L'hôte choisit les **catégories** ; le plus rapide est annoncé ; touches 1 à 4 au clavier. |
| Réflexe | Le shiba surgit d'un buisson : le plus rapide gagne. **Chat-piège** : s'il sort un chat, ne pas toucher (40 points de sang-froid). Temps mesuré sur l'appareil, borné par le serveur. |
| Le juste nombre | Estimer un nombre : le plus proche gagne, la réponse exacte rapporte un bonus. La révélation place chaque estimation sur une **droite graduée** (écart en %). |
| Petit Bac | Une lettre, 5 catégories (parmi 16) ; « Stop ! » laisse 10 s aux autres. Puis **15 s de vérification** : chacun peut contester une réponse douteuse, retirée si la majorité des autres est d'accord. |
| Calcul express | Course aux calculs, de plus en plus corsés (multiplications, carrés, **équations à trous**). **Pavé numérique** sur téléphone ; courte pause après une erreur (pas de réponses au hasard en rafale). |
| Mots mélangés | Course : on **touche les lettres** pour remplir les cases (ou on tape au clavier). Indices : première lettre à 12 s, dernière à 21 s. |

**Asynchrone, dans la conversation** (une carte jouable dans le fil, chacun joue quand il veut, la carte se met à jour en direct, résultat annoncé dans le fil) :

| Jeu | Principe et nouveautés |
| --- | --- |
| Devine mon dessin | On dessine un mot (3 suggestions ou mot perso) et on l'envoie ; 24 h et 20 essais pour deviner, avec des **lettres offertes** après 5, 10 et 15 essais. Les gagnants et leur nombre d'essais sont affichés. |
| Morpion | Duel contre un membre choisi, ou défi ouvert. Dernier coup surligné ; **Revanche** en un geste (l'autre commence) avec la **série** comptée. |
| Quatre en ligne | Duel : les jetons **tombent** dans les colonnes, aperçu du jeton au survol sur PC ; revanche et série. |
| Shifumi | Duel en **2 ou 3 manches gagnantes** ; coups cachés jusqu'à ce que les deux aient joué, puis « Shi… fu… mi ! » ; revanche et série. |
| Tu préfères ? | Sondage à deux options (dilemmes bilingues, jamais les mêmes coup sur coup dans un groupe, ou propositions perso) ; **vote anonyme** possible ; « Un autre dilemme » en un geste. |
| Le pendu | Tout le groupe cherche le même mot : mot surprise avec son **thème** et sa **difficulté**, ou mot choisi par un membre avec un **indice** ; 7 erreurs permises ; les « détectives » sont mis à l'honneur. |
| Le nombre mystère | Plus grand ? Plus petit ? Avec **chaud / froid** selon l'écart et une **barre** de l'intervalle restant (1–100 ou 1–1000). |

Une seule partie **en direct** à la fois par groupe ; les jeux de conversation, eux, peuvent être nombreux en même temps (20 en cours par groupe au plus) et restent jouables même si une partie en direct est lancée.

### Le reste (V1 du brief, conservé)

- **Chat** : présence, non lus, séparateur « Nouveaux messages », historique paginé, réactions illustrées par le shiba, envoi optimiste avec « Réessayer », anti-rafale (5 messages / 5 s).
- **Cadre de jeu commun** : lobby (réglages, durée estimée, « Lancer »), hôte transmis s'il part, lobby annulé après 10 min, cartes d'invitation et de résultats dans le fil, « Rejouer » avec les mêmes joueurs et réglages.
- **Gamification** : XP (parties en direct : participation, points, podium, première partie du jour, bonus de série ; jeux de conversation : participation et victoire, 10 par jour au plus), niveaux, rangs, 5 accessoires, 10 badges, série quotidienne à l'heure de Paris, classement de chaque groupe (semaine et depuis toujours), podium hebdomadaire, célébrations (confettis, passage de niveau, badges qui se retournent, sons désactivables).
- **Interface** : mobile d'abord (un écran + onglets), tablette (2 colonnes), PC (3 colonnes), une adresse par groupe et par partie (le bouton retour fonctionne, et referme les fenêtres ouvertes), application installable (PWA), « Réduire les animations », cibles tactiles de 44 px, navigation clavier.

## Cadre technique

```
index.html, src/          Interface (Vite + Preact/htm + signals)
  i18n/                   Traductions (fr.js, en.js) et textes composés (messages système, aperçus)
  lib/transport.js        Module de transport unique (règle 7) : requêtes + interrogation adaptative
  state/                  État : session, groupes, partie, jeux de conversation, annuaire des membres (photos)
  screens/                Écrans (groupes, chat, hub, lobby, résultats, profil…)
  games/drawit/           Draw It ; games/live/ : les 6 jeux par manches ; games/async/ : cartes et lancement des jeux de conversation
  components/Shiba.js     Mascotte vectorielle originale (4 pelages, expressions, accessoires) et avatar (photo ou shiba)
public/                   Logo, icônes PWA, polices Fredoka et Nunito (auto-hébergées), service worker
netlify/functions/        api.mjs (/api/*), cleanup.mjs (@daily), weekly-podium.mjs (lundi)
server/                   Règles serveur : comptes et appareils, groupes, messages, photos, récompenses, Blobs
  games/                  Cadre des parties en direct, Draw It, moteur « par manches » (rounds.js) et ses 6 jeux (live.js)
  async/                  Cadre des jeux de conversation (index.js) et leurs 7 jeux (games.js)
shared/                   Logique commune client/serveur : catalogue, comparaison des mots, barème, XP, modération
data/                     Contenus bilingues : 300 mots FR + 300 mots EN, 160 questions de quiz, 100 estimations, 130 dilemmes, 16 catégories de Petit Bac
tests/                    Tests unitaires, d'intégration (API) et de bout en bout (navigateurs)
```

Les huit règles du brief s'appliquent à tous les jeux :

1. **Le serveur fait foi** : mots secrets, bonnes réponses du quiz, nombre mystère, coup caché du shifumi ne sont envoyés à personne avant la révélation (vues filtrées par joueur) ; points, XP et échéances sont calculés dans la Function avec l'heure du serveur.
2. **Interrogation adaptative** : une seule requête `POST /api/sync` toutes les secondes en partie, toutes les 3 s dans un groupe, 5 s ailleurs ; en pause onglet masqué. Chaque réponse ne renvoie que les nouveautés ; pour les jeux de conversation, un index de versions par groupe permet de ne renvoyer que les cartes qui ont changé. La révision du compte (`meRev`) signale aux autres appareils qu'un réglage a changé.
3. **Écritures en ajout seul** : chaque message, lot de traits, proposition, réponse de manche et réaction crée sa propre clé.
4. **Transitions conditionnelles** : créations avec `onlyIfNew` et changements d'état par écriture conditionnelle sur l'ETag (`onlyIfMatch`) — une seule requête fait avancer une partie ; un coup dans un jeu de conversation est une écriture conditionnelle sur l'état du jeu (deux coups simultanés ne s'écrasent jamais).
5. **Cohérence forte** pour toutes les lectures (`consistency: 'strong'`).
6. **Même région** pour Functions et Blobs (valeurs par défaut ; voir `SHX_BLOBS_REGION`).
7. **Transport isolé** : `src/lib/transport.js` peut être remplacé par des WebSockets sans toucher aux règles.
8. **Secrets** : clé de connexion hachée (scrypt), jeton de session et liens de photos signés (HMAC) vérifiés à chaque appel.

### Budget Netlify (estimation)

- Partie de Draw It de 10 min à 4 : environ 3 400 requêtes, soit 2 à 3 crédits calcul compris. Une partie de quiz (10 manches) à 4 : environ 1 000 requêtes.
- Une heure de chat à 4 : environ 4 800 interrogations ≈ 1 crédit de requêtes + 1 à 2 crédits de calcul. Les jeux de conversation n'ajoutent qu'une requête par coup (leur suivi passe par l'interrogation du groupe déjà en place).
- Photos : 20 à 40 Ko chacune, mises en cache par le navigateur (une semaine).

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
npm test                # tests unitaires : barèmes, règles des 14 jeux, traductions complètes, XP, série, concurrence Blobs
npm run check:words     # vérification des banques de mots (français et anglais)
npm run test:api        # intégration (netlify dev lancé avec SHX_ENABLE_TEST_GAME=1)
npm run test:e2e        # parcours type sur 3 navigateurs : PC, téléphone, tablette (Draw It)
npm run test:e2e:v2     # parcours v2 sur 2 navigateurs : anglais + français, photo, morpion, quiz
```

Résultats obtenus en local : **65 tests unitaires** (dont les règles et barèmes de chaque jeu : séries du quiz, chat-piège, contestations du Petit Bac, équations à trous, revanches, indices…), **25 tests d'intégration** (dont plusieurs groupes et la limite de 50, photo visible des seuls membres avec lien signé, téléphone + PC synchronisés, morpion complet puis revanche — deux demandes simultanées donnent une seule revanche —, contestation à la majorité au Petit Bac, « Autres mots » de Draw It, manche de quiz sans fuite de la bonne réponse) et **deux parcours navigateur** complets (onglets du hub, liste des jeux en cours, message reçu en moins de 3 s, dessin affiché chez les devineurs en 0,6 à 1 s, coup de morpion visible chez l'adversaire en 3 s environ).

Bon à savoir : le magasin Blobs local de `netlify dev` ne renvoie pas d'ETag en lecture ; les écritures conditionnelles (`onlyIfMatch`) y sont donc moins strictes qu'en production. Les tests unitaires couvrent ces écritures avec un magasin en mémoire fidèle.

## Crédits

- Logo : fourni pour le projet (`logo_weplay_shibax.png`), décliné en icônes par `scripts/make-icons.py`.
- Polices Fredoka et Nunito : SIL Open Font License (`public/fonts/`).
- Contenus des jeux (mots, questions, dilemmes, catégories) : rédigés pour le projet.
- Bibliothèques : Preact (MIT), htm (Apache-2.0), @preact/signals (MIT), uqr (MIT), @netlify/blobs (MIT), Vite (MIT).
