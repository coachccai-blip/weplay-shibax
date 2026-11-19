# Weplay Shibax — Brief fonctionnel

Nov 19, 2026 · @Clément

## En bref

Weplay Shibax est une application web de chat entre amis où l'on lance des mini-jeux directement depuis la conversation. Le premier jeu, Draw It, consiste à faire deviner un mot en le dessinant. L'application fonctionne sur PC et mobile sans inscription, dans un univers shiba épuré aux couleurs pastel.

Ce brief décrit le comportement attendu de la V1. Il est rédigé pour être remis tel quel à Claude Code.

| Élément | Choix pour la V1 |
| --- | --- |
| Public | Groupes d'amis, famille, collègues |
| Taille d'une partie | 2 à 8 joueurs |
| Durée d'une session | 5 à 15 minutes, lancée depuis un salon de discussion |
| Appareils | Navigateur mobile et PC, même compte sur les deux |
| Langue | Français, tutoiement |
| Hébergement | Netlify, détaillé dans « Cadre technique » |

Cinq principes guident tous les choix :

- **Zéro friction** : aucun formulaire. Un identifiant, un pseudo et un shiba sont attribués à la première ouverture.
- **Le chat est le cœur** : un jeu se lance depuis un salon et y revient avec ses résultats.
- **Mobile d'abord** : chaque écran est conçu pour le pouce, puis élargi pour le PC.
- **Un cadre, plusieurs jeux** : lobby, manches, score et récompenses sont communs. Draw It n'est que le premier jeu.
- **Gamification douce** : on récompense la participation et la régularité, pas seulement la victoire.

## Périmètre de la V1

La V1 livre un chat en salons privés, le cadre de jeu commun et Draw It complet. Le reste est repoussé, mais l'architecture ne doit pas l'empêcher.

| Domaine | Dans la V1 | Plus tard |
| --- | --- | --- |
| Compte | Identifiant automatique, pseudo et shiba modifiables, reprise par clé | E-mail, connexion Google ou Apple |
| Chat | Salons privés sur invitation, texte, emojis, réactions, non lus | Messages privés, salons publics, photos, vocal, notifications push |
| Jeux | Hub, lobby commun, Draw It | Autres jeux, visibles en cartes « Bientôt » |
| Draw It | Mot proposé ou mot perso, dessin en direct, indices, score, podium | Pot de peinture, formes, mode équipes |
| Gamification | XP, niveaux, badges, série quotidienne, classement du salon | Monnaie et boutique, défis quotidiens, classement mondial |
| Interface | Thème clair pastel, français, ajout à l'écran d'accueil du téléphone | Thème sombre, autres langues, applications des stores |

## Identité et connexion

Personne ne crée de compte : à la première ouverture, l'application en attribue un et le retient sur l'appareil. Aucun e-mail, aucun mot de passe à inventer.

| Attribut | Règle | Modifiable |
| --- | --- | --- |
| Identifiant | `SHX-` suivi de 6 caractères (majuscules et chiffres, sans 0, O, 1 ni I), unique | Non |
| Pseudo | Tiré au sort, par exemple « Mochi Malicieux » ; 3 à 16 caractères | Oui |
| Shiba | Pelage tiré au sort : roux, crème, sésame ou noir et feu | Oui |
| Clé de connexion | Secret de 12 caractères, masqué par défaut dans le profil | Régénérable |

### Première visite

1. L'utilisateur ouvre l'application ou un lien d'invitation.
2. L'écran de bienvenue présente son shiba et son pseudo.
3. Il peut relancer le tirage ou saisir son propre pseudo, puis valide avec « C'est parti ».
4. Il arrive sur ses salons, ou directement dans le salon du lien d'invitation.

À chaque visite suivante, il est reconnu sans rien saisir.

### Même compte sur PC et mobile

- **Par QR code** : le profil affiche un QR code valable 10 minutes et utilisable une fois. Le scanner avec le téléphone y ouvre l'application, déjà connectée.
- **Par saisie** : l'écran de bienvenue propose « J'ai déjà un compte », qui demande l'identifiant et la clé de connexion.
- Les appareils reliés partagent salons, progression et badges, et peuvent être utilisés en même temps.
- Régénérer la clé déconnecte tous les autres appareils.

### Règles

- Le pseudo n'est pas unique ; l'identifiant distingue deux homonymes sur la fiche d'un membre.
- Un pseudo contenant un terme de la liste de mots interdits est refusé.
- Après la première partie, un rappel invite à noter la clé de connexion.
- Sans la clé et sans appareil encore connecté, le compte est perdu. Le profil le dit clairement.

## Parcours et écrans

Huit écrans suffisent ; le salon de discussion est celui d'où tout part et où tout revient.

| Écran | Rôle | Éléments clés |
| --- | --- | --- |
| Bienvenue | Présenter le compte attribué | Shiba, pseudo, « C'est parti », « J'ai déjà un compte » |
| Mes salons | Choisir où discuter | Salons avec dernier message, non lus et partie en cours ; « Créer un salon », « Rejoindre avec un code » |
| Salon | Discuter et lancer un jeu | Fil de messages, saisie, bouton « Jouer », membres, classement, bandeau de partie en cours |
| Hub de jeux | Choisir un jeu | Cartes de jeux, ouvert par « Jouer » |
| Lobby | Réunir les joueurs, régler la partie | Joueurs présents, réglages, « Lancer » |
| Partie | Jouer | Propre à chaque jeu ; pour Draw It : dessin, outils, chrono, indice, propositions, scores |
| Résultats | Récompenser | Podium, points, XP gagnée, badges débloqués, « Rejouer » |
| Profil | Suivre sa progression | Shiba, niveau, barre d'XP, badges, série, connexion d'un autre appareil, réglages |

### Parcours type

1. L'hôte crée un salon et partage le lien d'invitation.
2. Ses amis ouvrent le lien sur leur téléphone ; chacun reçoit son shiba et arrive dans le salon.
3. L'hôte touche « Jouer », choisit Draw It et règle la partie. Une carte d'invitation apparaît dans le fil.
4. Les amis touchent « Rejoindre », l'hôte lance la partie.
5. Chacun dessine à son tour. Le podium s'affiche, la barre d'XP de chacun progresse.
6. Tous reviennent au salon, où une carte résume la partie et propose de rejouer.

### Mobile et PC

- **Mobile (moins de 768 px)** : un écran à la fois, barre d'onglets en bas (Salons, Profil). Le bouton « Jouer » reste visible à côté de la saisie.
- **PC (1 024 px et plus)** : trois colonnes, pour les salons, la conversation, puis les membres et le classement. En partie, le jeu prend le centre et les propositions la colonne de droite.
- **Entre les deux** : deux colonnes, la liste des salons repliable.
- Chaque salon et chaque partie a sa propre adresse : ouvrir le lien mène au bon écran, et le bouton retour fonctionne partout.

## Chat

Un salon est un fil de discussion privé, accessible sur invitation, où les jeux apparaissent comme des cartes dans la conversation.

### Salons

- **Créer** : un nom de 3 à 30 caractères suffit. Le créateur devient l'hôte du salon.
- **Inviter** : chaque salon a un lien d'invitation et un code de 6 caractères. L'hôte peut les réinitialiser.
- **Capacité** : 20 membres par salon.
- **Gérer** : l'hôte peut renommer le salon et retirer un membre. Chacun peut quitter un salon.
- **Présence** : une pastille signale les membres actifs dans les 30 dernières secondes.

### Messages

| Type | Contenu |
| --- | --- |
| Texte | 1 à 500 caractères, emojis compris, affiché comme texte brut |
| Réaction | Six réactions illustrées par le shiba, posées sous un message |
| Système | Arrivée, départ, changement d'hôte, podium de la semaine |
| Carte de jeu | Invitation à une partie, puis résultats |

- Un message envoyé apparaît chez les autres membres en moins de 3 secondes, sans rechargement.
- Le message s'affiche tout de suite chez son auteur, marqué « en cours d'envoi ». En cas d'échec, « Réessayer » apparaît.
- Le salon charge les 50 derniers messages, puis les précédents quand on remonte le fil.
- Chaque salon affiche son nombre de non lus, et un séparateur « Nouveaux messages » marque la reprise.
- Sur PC, Entrée envoie et Maj + Entrée passe à la ligne.

### Cartes de jeu

- **Invitation** : jeu, hôte de la partie, réglages, joueurs inscrits et bouton « Rejoindre ». Son statut évolue en direct : en attente, en cours, terminée.
- **Résultats** : podium, miniatures des dessins à agrandir d'un toucher, bouton « Rejouer ».
- Pendant une partie, les membres qui ne jouent pas continuent à discuter. Un bandeau « Partie en cours » leur propose de la rejoindre.

## Hub de jeux

Le hub est le catalogue des jeux. Chaque jeu s'y branche sur un cadre commun, pour qu'en ajouter un ne demande d'écrire que ses règles.

### Catalogue

- Une carte par jeu : illustration shiba, nom, accroche, nombre de joueurs, durée moyenne.
- En V1, Draw It est jouable et deux cartes « Bientôt » grisées annoncent la suite.

### Cadre commun

| Brique | Fournie par la plateforme | Définie par chaque jeu |
| --- | --- | --- |
| Lobby | Liste des joueurs, bouton « Lancer », durée estimée | Réglages proposés, nombre de joueurs minimal et maximal |
| Déroulé | Manches, chrono, synchronisation, reprise après coupure | Règles d'une manche, conditions de fin |
| Score | Tableau des scores, podium | Barème |
| Récompenses | Conversion en XP, classement du salon | Badges propres au jeu |
| Chat | Cartes d'invitation et de résultats | Contenu du résumé |

### Règles communes à toutes les parties

- Une partie passe par trois états : en attente, en cours, terminée.
- Un salon n'accueille qu'une partie active à la fois.
- Celui qui crée la partie en est l'hôte : il la règle et la lance. S'il part, le rôle passe au joueur suivant.
- Le lancement est possible dès que le nombre minimal de joueurs est atteint.
- Un lobby resté 10 minutes sans lancement est annulé.
- Une partie qui tombe sous le nombre minimal de joueurs actifs se termine ; les points acquis comptent.

## Draw It

Un joueur dessine un mot, les autres le devinent le plus vite possible. Chacun dessine à son tour et le meilleur total l'emporte.

Trois termes servent partout : une **partie** compte un ou plusieurs **tours** ; pendant un tour, chaque joueur dessine une fois ; chaque dessin est une **manche**.

### Réglages du lobby

| Réglage | Choix | Par défaut |
| --- | --- | --- |
| Joueurs | 2 à 8 | Tous les inscrits au lobby |
| Tours | 1, 2 ou 3 | 2 jusqu'à 5 joueurs, 1 à partir de 6 |
| Temps de dessin | 45, 60 ou 90 secondes | 60 secondes |
| Mots perso | Autorisés ou non | Autorisés |
| Thèmes | Tous, ou une sélection parmi six | Tous |

Avec les réglages par défaut, une partie à 4 joueurs dure 11 minutes au plus.

### Déroulé d'une manche

&#91;embedded content: déroulé d'une manche · 3 étapes, 1 décision\]

Tant qu'il reste une manche, la boucle repart au choix du mot avec le dessinateur suivant.

1. **Choix du mot, 15 secondes.** Le dessinateur voit trois mots, un par difficulté, et le champ « Mon propre mot ». Sans choix à l'échéance, le mot facile est retenu.
2. **Dessin, selon le temps réglé.** Le dessinateur dessine. Les autres voient le dessin se construire et envoient leurs propositions.
3. **Fin de manche, 8 secondes.** Elle survient quand tous ont trouvé, quand le temps est écoulé, ou quand le dessinateur passe ou s'en va. Le mot est révélé avec les points de chacun.
4. **Suite.** Le dessinateur suivant prend la main. Après la dernière manche du dernier tour, les résultats s'affichent.

L'ordre des dessinateurs est tiré au sort au lancement et reste le même à chaque tour.

### Le mot

- **Mots proposés** : un facile, un moyen, un difficile, chacun avec son multiplicateur de points. Un mot ne revient pas dans la même partie.
- **Mot perso** : 2 à 25 caractères, trois mots au plus, en lettres, espaces, traits d'union et apostrophes. Un terme de la liste de mots interdits est refusé.
- **Banque de mots** : 300 mots français courants au lancement, répartis en six thèmes (animaux, nourriture, objets, lieux, métiers, actions) et trois difficultés. Ni noms propres ni marques.
- La banque est un fichier de données séparé du code, pour l'enrichir sans toucher aux règles.

### Le dessin

- La zone de dessin est au format 4:3 et montre exactement la même image à tous, quel que soit l'écran.
- Outils : crayon en trois épaisseurs, gomme, 12 couleurs franches, « Annuler » le dernier trait, « Tout effacer ».
- On dessine au doigt, au stylet ou à la souris. La page ne défile pas et ne zoome pas pendant le tracé.
- Chez les devineurs, le dessin apparaît trait par trait avec au plus 1,5 seconde de retard.
- Le dessinateur voit défiler les propositions des autres, sans pouvoir écrire.
- « Passer » met fin à la manche ; le dessinateur ne marque alors aucun point.
- Écrire le mot en toutes lettres est interdit : la règle est affichée, sans contrôle automatique en V1.

### Les propositions

- Le champ de proposition est sous le dessin. Les essais sont illimités, à raison d'un par seconde au plus.
- La comparaison ignore majuscules, accents, traits d'union, apostrophes et espaces en trop : « Arc-en-ciel » vaut « arc en ciel ».
- Une bonne réponse n'est jamais montrée aux autres, qui lisent seulement « Mochi a trouvé ! ». Le joueur ne propose plus jusqu'à la manche suivante.
- Une proposition à une lettre près, pour un mot de 5 lettres ou plus, reçoit en privé « Tu chauffes ! ».
- Une proposition qui contient le mot sans lui être égale est masquée aux autres.
- Les autres propositions sont visibles de tous : elles font partie du jeu.

### Les indices

- Dès le début, les devineurs voient une case par lettre ; espaces et traits d'union sont visibles.
- Pour un mot de 5 lettres ou plus, une lettre se dévoile à la moitié du temps et une seconde aux trois quarts.

### Le score

| Qui | Points |
| --- | --- |
| Devineur | De 100 points à la première seconde à 30 points à la dernière, en baisse régulière |
| Premier à trouver | 20 points de bonus |
| Dessinateur | 100 points multipliés par la part des devineurs qui ont trouvé : 3 sur 4 donnent 75 points |
| Multiplicateur du mot | Facile et mot perso ×1, moyen ×1,25, difficile ×1,5, appliqué à tous les points de la manche |
| Égalité finale | Départagée par le nombre de mots trouvés, puis rang partagé |

Points du devineur = 30 + 70 × temps restant ÷ temps de dessin, arrondi à l'entier le plus proche. À mi-temps, cela donne 65 points.

### Fin de partie

- Le podium montre les trois premiers shibas, puis le classement complet, l'XP gagnée et les badges débloqués.
- « Rejouer » ouvre un lobby avec les mêmes joueurs et réglages ; « Retour au salon » ramène au fil.
- Une carte de résultats est publiée dans le salon avec le podium et les dessins de la partie.

## Gamification

La progression récompense trois choses : jouer, bien jouer et revenir. Tout est calculé côté serveur à la fin de chaque partie.

### XP

| Source | XP |
| --- | --- |
| Partie terminée | 20 |
| Points marqués | 1 XP pour 10 points |
| Podium | 30 pour le 1er, 20 pour le 2e, 10 pour le 3e |
| Première partie du jour | 15 |
| Série en cours | 10 % de plus par jour consécutif, plafonné à 50 % |

Une partie de moins de 3 manches ne rapporte pas d'XP.

### Niveaux et rangs

Passer du niveau n au suivant demande 100 + 25 × (n − 1) XP : 100 XP pour atteindre le niveau 2, 1 800 XP cumulés pour le niveau 10.

| Niveaux | Rang | Débloque |
| --- | --- | --- |
| 1 à 4 | Chiot | Choix du pelage, dès le départ |
| 5 à 9 | Jeune shiba | Bandana au niveau 5 |
| 10 à 19 | Shiba futé | Lunettes rondes au niveau 10, béret au niveau 15 |
| 20 à 29 | Shiba doré | Écharpe au niveau 20 |
| 30 et plus | Shibax légendaire | Couronne au niveau 30 |

### Badges

Dix badges au lancement, visibles dans le profil et grisés tant qu'ils ne sont pas obtenus.

| Badge | Condition |
| --- | --- |
| Première patte | Terminer sa première partie |
| Flair infaillible | Trouver un mot en moins de 5 secondes |
| Picasshiba | Faire deviner son dessin à tous les joueurs |
| Sans faute | Trouver tous les mots d'une partie |
| Mot maison | Faire deviner un mot perso à tous les joueurs |
| Chef de meute | Gagner 10 parties |
| Fidèle | Jouer 7 jours de suite |
| Marathonien | Terminer 50 parties |
| Pipelette | Envoyer 100 messages |
| Hôte en or | Créer un salon rejoint par 3 personnes |

### Série et classement

- **Série** : un jour compte dès qu'une partie est terminée. Un jour manqué remet la série à zéro. Les jours suivent l'heure de Paris.
- **Classement du salon** : il additionne l'XP gagnée dans le salon du lundi au dimanche, avec un onglet « Depuis toujours ».
- Chaque lundi, un message système annonce le podium de la semaine écoulée.

### Moments de célébration

| Moment | Retour à l'écran |
| --- | --- |
| Bonne réponse | Le shiba saute, vibration courte sur mobile |
| Fin de partie | Podium, barre d'XP qui se remplit, confettis pastel pour le vainqueur |
| Passage de niveau | Écran plein avec le nouveau niveau et l'accessoire débloqué |
| Badge obtenu | Carte qui se retourne pour révéler le badge |

Les sons sont courts et se coupent depuis le profil.

## Direction artistique

L'interface est claire et calme : fond crème, formes arrondies, une couleur pastel par fonction et un shiba qui réagit à ce qui se passe.

### Palette

| Rôle | Couleur | Code | Usage |
| --- | --- | --- | --- |
| Fond | Crème | `#FFF8F0` | Arrière-plan de toutes les pages |
| Surface | Blanc | `#FFFFFF` | Cartes, bulles, zone de dessin |
| Primaire | Abricot shiba | `#FFC9A3` | Boutons principaux, messages envoyés |
| Secondaire | Lavande | `#D9CCF5` | Onglet actif, cartes de jeu |
| Succès | Menthe | `#BFE8D4` | Bonne réponse, présence en ligne |
| Information | Bleu ciel | `#BFDFF7` | Messages système, indices |
| Récompense | Jaune beurre | `#FFE9A8` | XP, badges, podium |
| Alerte | Rose corail | `#F9B9B7` | Erreurs, chrono dans les 10 dernières secondes |
| Texte | Brun encre | `#4A3B36` | Tout le texte courant |
| Texte discret | Brun gris | `#7A6A64` | Heures, légendes |

Le brun encre garde un contraste d'au moins 6,4:1 sur chacune de ces couleurs. Le brun gris ne s'emploie que sur le crème et le blanc. Jamais de texte blanc sur un pastel.

### Formes et typographie

- Coins arrondis de 16 px pour les cartes, boutons en forme de pilule.
- Ombres douces et courtes, aucune bordure dure, espacements sur une grille de 8 px.
- Une seule action principale par écran, toujours en abricot.
- Titres en Fredoka, texte en Nunito : deux polices libres aux formes rondes, hébergées avec l'application.

### Les shibas

- La mascotte est un shiba original dessiné pour l'application, en formes simples et aplats, au format vectoriel. Elle ne reprend aucun personnage existant.
- Quatre pelages (roux, crème, sésame, noir et feu) se combinent aux accessoires gagnés.
- Cinq expressions : content, concentré, surpris, triste, en fête.
- Le shiba sert d'avatar et apparaît à l'accueil, sur le podium, dans les écrans vides et les erreurs. Sa queue qui remue sert d'indicateur de chargement.

### Ton et mouvement

- Tutoiement, phrases courtes, humour léger. Les clins d'œil canins restent rares : « Bien joué, la meute ! ».
- Jamais de moquerie en cas de défaite ou de dessin raté.
- Transitions de 150 à 250 ms, léger rebond sur les boutons. Les confettis sont réservés aux victoires et aux passages de niveau.
- Un réglage « Réduire les animations » existe et suit la préférence du système.

### Accessibilité

- Cibles tactiles d'au moins 44 px.
- Aucune information portée par la couleur seule : une icône ou un texte l'accompagne.
- Navigation complète au clavier sur PC, avec un focus visible.

### Couleurs de dessin

Les pastels sont réservés à l'interface. La palette de dessin compte 12 couleurs franches, lisibles sur fond blanc : noir, gris, marron, rouge, orange, jaune, vert clair, vert foncé, bleu clair, bleu foncé, violet, rose.

## Cadre technique Netlify

Tout tourne sur Netlify : le site statique, des Functions pour l'API et Blobs pour les données. Une Function répond à une requête puis s'arrête, en 60 secondes au plus : l'application se synchronise donc par interrogations rapprochées.

&#91;embedded content: architecture Netlify · 5 briques\]

Les Functions valident chaque action avant de l'enregistrer dans Blobs.

### Rôle de chaque brique

| Brique | Rôle |
| --- | --- |
| Site statique | L'application web, servie par le CDN |
| Functions | API : comptes, salons, messages, parties, validation des propositions, scores, XP |
| Blobs | Données : comptes, salons, messages, état des parties, traits, images des dessins |
| Scheduled Functions | Ménage des messages et dessins expirés, podium de la semaine |

### Règles à respecter

1. **Le serveur fait foi.** Le mot secret n'est jamais envoyé aux devineurs. Propositions, scores et XP sont validés dans une Function, et l'heure du serveur fixe toutes les échéances.
2. **Interrogation adaptative.** Toutes les secondes en partie, toutes les 3 secondes dans un salon ouvert, en pause quand l'onglet est masqué. Chaque réponse ne renvoie que les nouveautés.
3. **Écritures en ajout seul.** Un message, un lot de traits ou une bonne réponse crée une nouvelle clé. Deux joueurs ne modifient jamais le même objet : dans Blobs, la dernière écriture écrase l'autre ([Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs.md)).
4. **Transitions par écriture conditionnelle.** Un changement d'état s'écrit avec `onlyIfNew`, pour qu'un seul appel le déclenche. Sans serveur permanent, c'est la première interrogation reçue après une échéance qui fait avancer la partie.
5. **Lectures en cohérence forte** pour l'état vivant. Par défaut, une mise à jour peut mettre jusqu'à 60 secondes à se propager.
6. **Même région pour Functions et Blobs.** Par défaut, les Functions tournent dans l'Ohio (`cmh`) et les magasins Blobs globaux aussi (`us-east-2`). Changer la région des Functions demande une offre Pro ; viser alors Francfort pour les deux, fra côté Functions et eu-central-1 côté Blobs ([configuration des Functions](https://docs.netlify.com/build/functions/configuration)).
7. **Transport isolé.** Envoi et réception passent par un seul module, pour remplacer un jour l'interrogation par des WebSockets sans toucher aux règles du jeu.
8. **Secrets.** La clé de connexion est stockée hachée. Chaque appel porte un jeton de session vérifié par la Function.

### Budget Netlify

| Poste | Crédits |
| --- | --- |
| Offre Free | 300 par mois |
| Déploiement de production | 15 par déploiement |
| Requêtes web | 2 pour 10 000 requêtes |
| Calcul des Functions | 10 par Go-heure |

Chiffres de la [grille tarifaire Netlify](https://netlify.com/pricing.md). Une partie de 10 minutes à 4 joueurs représente environ 3 000 requêtes, soit 2 à 3 crédits calcul compris : c'est une estimation, à mesurer dès le lot 2.

Vingt déploiements de production épuisent à eux seuls l'offre Free. Le développement se teste donc en local avec `netlify dev`.

### Alternative temps réel

Netlify propose désormais [Netlify Server](https://www.netlify.com/blog/introducing-netlify-server.md), un serveur Node.js longue durée qui accepte les WebSockets. Le dessin y serait instantané, mais le produit est en accès anticipé : gratuit pour l'instant, tarifs non annoncés, une seule instance sur l'offre Free ([limites](https://docs.netlify.com/build/server/limits/)).

Pour des données à forte concurrence, la documentation de Blobs renvoie vers une base de données. [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database.md), un Postgres géré, est réservée aux offres à crédits, Free comprise.

La V1 reste sur Functions et Blobs ; la règle 7 garde la porte ouverte.

## Cas limites et règles de gestion

Aucune de ces situations ne doit bloquer une partie ni exiger un rechargement.

| Situation | Comportement attendu |
| --- | --- |
| Le dessinateur ne choisit pas de mot | Le mot facile est retenu au bout des 15 secondes |
| Le dessinateur quitte ou reste injoignable 10 secondes | La manche se termine ; les devineurs gardent leurs points, le dessinateur n'en marque pas |
| Un devineur perd la connexion | Il reste inscrit ; à son retour, il retrouve la manche en cours avec le dessin complet |
| Un joueur absent doit dessiner | Son tour est sauté tant qu'il est absent |
| Il ne reste qu'un joueur actif | La partie se termine sur les points acquis |
| Un membre rejoint une partie en cours | Il joue dès la manche suivante, en fin de rotation, avec un score de 0 |
| Page rechargée en pleine partie | Retour au même point, état relu depuis le serveur |
| Même compte ouvert sur deux appareils | Un seul joueur dans la partie ; les actions des deux appareils comptent pour lui |
| Deux joueurs trouvent au même instant | L'heure d'arrivée au serveur départage ; un seul reçoit le bonus |
| Envoi d'un trait en échec | Nouvel essai automatique ; l'ordre des traits est préservé |
| Onglet passé en arrière-plan | Synchronisation en pause ; au retour, l'état est rattrapé en une requête |
| Horloge de l'appareil décalée | Le chrono affiché se cale sur l'heure du serveur |
| Salon complet | Le lien d'invitation affiche « Salon complet » |
| Invitation réinitialisée | L'ancien lien affiche « Invitation expirée » |
| L'hôte quitte le salon | Le membre le plus ancien devient hôte |
| Envois trop rapprochés | Au-delà de 5 messages en 5 secondes, l'envoi est suspendu quelques secondes, avec un message d'explication |

## Lots de livraison et critères d'acceptation

Six lots, chacun livrable et testable seul. Claude Code ne passe au suivant qu'une fois tous les critères du lot vérifiés.

### Lot 1 : socle et identité

Projet, composants de base aux couleurs de la charte, compte automatique, profil, connexion d'un second appareil.

- [ ] Une première visite crée un compte et affiche pseudo et shiba sans aucune saisie.
- [ ] Recharger la page ou revenir le lendemain retrouve le même compte.
- [ ] Le QR code, puis le couple identifiant et clé, connectent un second appareil au même compte.
- [ ] Tous les écrans sont utilisables de 360 à 1 440 px de large.

### Lot 2 : salons et chat

- [ ] Créer un salon, inviter par lien et rejoindre depuis un autre appareil fonctionnent.
- [ ] Un message apparaît chez les autres en moins de 3 secondes.
- [ ] Vingt messages envoyés au même moment depuis 4 appareils sont tous conservés, dans le même ordre pour tous.
- [ ] Non lus, réactions et historique paginé fonctionnent.
- [ ] La consommation de crédits d'une heure de chat à 4 est mesurée et notée.

### Lot 3 : cadre de jeu

- [ ] Le hub affiche Draw It et les cartes « Bientôt ».
- [ ] Un jeu factice traverse lobby, partie et résultats, avec ses cartes dans le chat.
- [ ] Un second lancement dans le même salon est refusé tant qu'une partie est active.

### Lot 4 : Draw It

- [ ] Une partie complète se joue à 3 appareils, dont un téléphone, sans rechargement.
- [ ] Le dessin apparaît chez les devineurs en moins de 1,5 seconde, identique sur mobile et PC.
- [ ] Le mot secret n'apparaît dans aucune réponse reçue par un devineur avant la fin de la manche.
- [ ] Mot proposé et mot perso fonctionnent ; accents et majuscules sont ignorés.
- [ ] Le barème et la comparaison des mots sont couverts par des tests automatisés.
- [ ] Chaque ligne du tableau des cas limites est vérifiée.

### Lot 5 : gamification

- [ ] XP, niveaux, accessoires, badges, série et classement du salon fonctionnent.
- [ ] Rejouer une même requête de fin de partie n'attribue pas l'XP deux fois.

### Lot 6 : finitions

- [ ] Animations, sons, écrans vides et erreurs sont illustrés par le shiba.
- [ ] Contrastes, navigation au clavier et réglage « Réduire les animations » sont vérifiés.
- [ ] L'application s'ajoute à l'écran d'accueil avec son icône shiba.
- [ ] Le parcours type est validé sur Chrome Android, Safari iOS, puis Chrome et Firefox sur PC.

## Décisions prises par défaut

Ces choix complètent la demande là où elle ne tranchait pas. Ils se modifient directement dans la colonne « Choix retenu » avant de remettre le brief à Claude Code.

| Sujet | Choix retenu | Autre option |
| --- | --- | --- |
| Salons | Privés, sur invitation, 20 membres | Ajouter un salon public d'accueil |
| Langue | Français uniquement | Français et anglais |
| Reprise du compte | QR code et clé de connexion | Ajouter un e-mail de secours |
| Synchronisation | Interrogation par Functions et Blobs | WebSockets par Netlify Server, en accès anticipé |
| Format de partie | 2 à 8 joueurs, 60 secondes par dessin | Jusqu'à 12 joueurs |
| Arrivée en cours de partie | Autorisée, dès la manche suivante | Réservée au lobby |
| Conservation | Messages 90 jours, dessins 30 jours | Sans limite |
| Récompenses | Accessoires débloqués par niveau | Monnaie et boutique |
| Modération | Liste de mots interdits, retrait par l'hôte | Signalement des messages |
| Données personnelles | Ni e-mail ni nom réel collectés, page de confidentialité simple | Relecture juridique avant une ouverture au grand public |

## Sources

- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs.md) : cohérence, écritures conditionnelles, régions, limites
- [Configuration des Functions](https://docs.netlify.com/build/functions/configuration) : durées, mémoire, régions
- [Netlify Server, temps réel](https://docs.netlify.com/build/server/real-time/) et [limites](https://docs.netlify.com/build/server/limits/)
- [Annonce de Netlify Server](https://www.netlify.com/blog/introducing-netlify-server.md)
- [Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database.md)
- [Grille tarifaire Netlify](https://netlify.com/pricing.md)
