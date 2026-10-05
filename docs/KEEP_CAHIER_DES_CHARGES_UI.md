# KEEP — Cahier des charges UI / source de vérité

Sous-spécification du cahier des charges maître : `docs/KEEP_MASTER_SPEC.md`. En cas d'évolution validée, les deux fichiers doivent rester cohérents.

Version : **2026-10-01.4**  
Branche produit unique : **`reconcile/claude-main-20260825`**  
Ce document est la référence à relire avant toute modification d'interface.

## 1. Règle d'intégration

Toute modification doit conserver les modules déjà validés. Une IA ne doit pas déplacer, dupliquer, renommer ou supprimer un module existant simplement parce qu'elle intervient sur une autre fonction. Si un changement touche une zone voisine, elle doit d'abord vérifier ce cahier des charges et les contrats automatiques.

La CI exécute `scripts/verify-ui-layout-baseline.cjs`. Si une règle ci-dessous est cassée, l'intégration doit échouer.

## 2. Profil propriétaire — disposition verrouillée

Dans l'en-tête du profil propriétaire :

- Avatar à gauche.
- Pseudo + certification au-dessus.
- Le badge de type **Fan / Créateur / DJ / Artiste / Producteur / Lieu** reste dans la zone identité.
- La certification reste toujours visible à côté du pseudo.
- Battle reste dans la même zone d'identité, à droite du type de profil.
- Ville / pays restent sous cette ligne.
- La barre suivante reste : **PLUS | Abonnés | Reprises | FREE**.
- **FREE est immédiatement à droite de Reprises**, une seule fois, aligné dans cette même barre.
- Aucun FREE ne doit apparaître à côté du type de profil.
- Aucun autre correctif ne doit déplacer ces éléments sans une nouvelle demande explicite de l'utilisateur.

## 3. Hamburger profil — pas de doublon de session

Le hamburger contient les fonctions de profil, communauté, musique et aide.  
La rubrique **Réseaux & site web** ne contient plus le switch global « Profil visible ».
Le switch global **Profil visible / privé** est placé tout en haut du centre Notifications.
Il **ne doit pas contenir d'entrée Compte / connexion / déconnexion**.

La connexion/déconnexion reste gérée dans **Réglages du profil** (`ProfileSettingsMobileScreen.tsx`). Il ne doit pas y avoir deux chemins concurrents qui donnent l'impression que l'utilisateur doit se reconnecter ou se déconnecter pour naviguer.

## 4. Barre des 5 onglets

Ordre fonctionnel immuable :

1. Loki Music
2. Découvertes
3. Playlists
4. Soirées
5. Profil

Ne pas redessiner `App.tsx`, `Navigation.tsx` ou la barre des 5 onglets pour résoudre un problème local d'écran.

## 5. Responsive

Le même produit doit fonctionner sur téléphone et ordinateur. Tests minimaux :

- 390×844
- 430×932
- 768×700
- 900×700
- 1440×900

Réduire puis agrandir la fenêtre ne doit jamais produire un écran noir ni faire disparaître la barre des 5 onglets.

## 6. Règle anti-régression

Avant chaque push qui modifie l'UI :

- vérifier la branche canonique ;
- exécuter le contrat UI ;
- exécuter le typecheck mobile ;
- exécuter les tests du profil ;
- vérifier le rendu 390×844 ;
- vérifier un rendu desktop ;
- ne pas corriger un test obsolète en restaurant un ancien design contraire à ce document.

## 7. Fichiers de contrôle

- `config/keep-ui-baseline.json` : version machine-readable de ce cahier des charges.
- `scripts/verify-ui-layout-baseline.cjs` : garde CI.
- `packages/mobile/src/screens/__tests__/ProfileMetricsLayout.contract.test.ts` : garde FREE hors de la zone type + présence unique après Reprises.
- `packages/mobile/src/screens/__tests__/ProfileOwnerMetricsLayout.contract.test.ts` : certification/type/Battle + ordre PLUS/Abonnés/Reprises/FREE.

## 8. Pépites / Collections

- L'écran Pépites sépare visuellement **TOUTES / ⚡ FREE / € EUROS**.
- Créer une collection suit trois étapes lisibles : **1. morceaux · 2. mode + prix · 3. paiement/publication**.
- Les morceaux déjà présents dans une collection publiée portent le repère **DÉJÀ PUBLIÉE** ; un appui explique le doublon et propose de gérer la collection existante.
- Le formulaire de publication est scrollable et suffisamment large sur téléphone comme sur desktop.
- En euros, le lien PayPal.Me ou autre lien HTTPS se configure directement dans le parcours ; aucun bouton ne doit pointer vers une route inexistante.
- En FREE, aucun lien bancaire n'est demandé.

## 9. Popups (fenêtres de message) — boutons verrouillés

Décision d'Adel (02/10/2026, capture « Tes parties Solo du jour sont terminées », même défaut déjà vu sur la popup e-mail du mode démo) :

- Toute popup passe par la popup Loki unique (`utils/keepAlert` → `components/AlertHost.tsx`). Ne jamais recréer une popup maison avec ses propres boutons.
- Les boutons sont **tous alignés sur une seule ligne, en bas, sur toute la largeur**, chacun de **même largeur**. Un libellé long passe sur 2 lignes **dans** son bouton.
- Interdit : boutons calés à droite avec des largeurs différentes, un bouton renvoyé seul à la ligne, boutons empilés en escalier.
- Plus de 3 boutons : grille régulière de 2 colonnes (cas à éviter : préférer 3 boutons maximum).
- Contrôles : `AlertHostButtonsLayout.contract.test.ts` (code) + robot de parcours « Solos épuisés » (mesure réelle : même ligne, même largeur, toute la largeur).


## 10. Règle globale de lisibilité et d’action directe

Décision d’Adel (04/10/2026), valable sur toute l’application Mobile et Web :

- Sur fond sombre, tout texte fonctionnel ou important est blanc/très clair. Un gris faible n’est autorisé que pour une information réellement secondaire.
- Une explication longue lue une seule fois ne reste pas affichée en permanence. Elle passe derrière **En savoir plus**, `?` ou une aide compacte.
- Ouvrir une aide ne doit pas déplacer les boutons principaux ni faire sauter la mise en page : l’espace est réservé ou le détail s’ouvre en surimpression.
- **1 clic maximum** pour atteindre une action ou afficher sa réponse.
- Un **2e clic** est réservé à la confirmation d’une action sensible : paiement, suppression, déconnexion, dépense de FREE, publication ou changement destructif de confidentialité.
- Éviter les chaînes hamburger → sous-menu → autre écran → autre bouton lorsqu’une action peut être faite dans le panneau courant.
- Chaque bouton visible doit déclencher une action réelle, un état, une ouverture ou une confirmation. Aucun bouton décoratif/inactif.
- Les mêmes règles s’appliquent à 390×844 et 1440×900 via la source partagée `packages/mobile/src`.
- Les textes et parcours doivent rester compréhensibles sans apprentissage préalable, y compris pour un enfant d’environ 10 ans.

## 11. Règles permanentes de lisibilité (décision d'Adel, 05/10/2026 — valable partout)

1. **Jamais de texte sombre sur fond sombre**, ni de noir sur gris. Sur fond sombre : texte blanc ou très clair. Le texte noir n'est autorisé que sur un fond clair ou une couleur vive (ex. bouton vert/jaune).
2. **Jamais plus de 2 lignes de texte affichées.** Au-delà : « En savoir plus ». Cette règle protège le design : un bloc ne grandit pas à cause d'un long texte.
3. **L'écriture ne doit pas être trop petite.** Notifications : titre ≥ 16, texte ≥ 14, liens et boutons ≥ 13, étiquettes ≥ 11. Une ligne de hauteur (`lineHeight`) n'est jamais plus petite que la taille du texte.
4. Ces règles se contrôlent par test de contrat (ex. `NotificationsReadableActions.contract.test.ts`) et par `scripts/verify-mobile-text-contrast.cjs`.
5. À étendre au reste de l'interface écran par écran, sans casser le design validé.

## 12. Règle permanente des espaces (décision d'Adel, 05/10/2026 — valable partout)

Respecter les espaces dans tout le système : aucun élément collé à un autre ni rogné par lui. Une jaquette ou une carte ne touche jamais l'en-tête ni le sous-titre ; un texte d'aide ne recouvre jamais un bouton.
- Au moins **16 px** entre un en-tête et le contenu qui suit, au moins **12 px** entre un texte d'aide et le bouton suivant.
- Un texte d'aide qui passe sur 2 lignes doit pouvoir le faire sans recouvrir son voisin (marges verticales, pas de hauteur figée).
- Même règle sur téléphone, tablette et ordinateur ; vérifier avec une capture avant de valider un écran.


## 13. Règle anti-pillage : écoute complète seulement après GARDER (décision d'Adel, 05/10/2026 — valable partout)

Dans une story, un swipe social ou Loki Pulse, un membre ne reçoit **aucun accès à l'écoute complète** (Apple Music, Spotify, YouTube, liens externes) d'une musique qu'il n'a pas gardée (FREE payés). Il entend l'extrait ; le titre peut être visible, mais on ne simplifie pas la copie : l'écoute complète ne se débloque qu'avec GARDER, pour que l'écoute et Loki Pulse ne servent pas à piller le travail des autres membres. Le bouton est remplacé par « 🔒 Écoute complète disponible après GARDER » (`MusicSwipeDeckModal` : `fullListenLocked`, verrouillé par test).

Règle complémentaire (05/10/2026) : **un texte placé à côté d'un bouton ou d'une icône** (en-têtes, lignes d'actions, cartes) doit toujours être dans un conteneur `flex: 1` + `minWidth: 0` (il passe à la ligne au lieu de pousser le bouton hors de l'écran), et le bouton en `flexShrink: 0`. Quand un bouton ou une ligne s'ajoute sous une carte ou une zone de contenu, c'est la zone de contenu qui rétrécit (`flex: 1` + `minHeight`), jamais le texte ni le bouton qui sont recouverts. À vérifier en 320×568, 375×667, 390×844 et 1440×900 avec le texte le plus long.


## 14. Stories — règles permanentes (décision d'Adel, 05/10/2026 — CANONIQUE, valable pour toute IA)

Contrat machine : `config/keep-product-contract.json` > `storiesExperience`. Contrôle bloquant : `scripts/verify-product-contract.cjs` (section « Stories ») + `musicOwnStory.test.ts`. **Ne jamais modifier ces règles sans demande explicite d'Adel dans la conversation en cours ; si on les modifie, mettre à jour ce chapitre, le contrat et le contrôle dans le même commit.**

1. **Une seule rangée d'une seule pièce, façon Instagram.** La photo de profil avec le « + » est le premier élément de la même rangée horizontale que les bulles (prop `leading` de `MusicStoryRail`) : on glisse toute la ligne d'un coup. Même code sur iPhone (TestFlight) et sur ordinateur. Aucune fenêtre pour la rangée.
2. **Qui apparaît.** Uniquement les membres **liés** : ceux que je suis, ceux qui me suivent (« abonné »), ceux qui ont repris une de mes musiques, ceux dont j'ai repris une musique. Jamais un inconnu « du même style » : sans lien, ni story ni notification. (Les suggestions d'amis par style sont des profils sans story, voir 7.)
3. **À côté de la photo** : mes abonnements. Les stories **non vues d'abord**, **la plus récente en premier** (date de dernière story, puis dernière connexion). Ensuite les amis sans story du jour (cercle gris), le **dernier connecté d'abord**.
4. **Story vue = tout au bout.** Dès qu'une story est vue, sa bulle quitte sa place et part **tout au bout de la ligne** (cercle gris + ✓) ; la suivante non vue avance et prend sa place : on appuie toujours au même endroit. Pour la revoir, on glisse jusqu'au fond. (Décision d'Adel du 05/10/2026 d'après Instagram : plus de rond « Autres », aucune fenêtre.)
5. **Ordre de la ligne** : stories non vues (la plus récente d'abord) → membres liés avec story → **stories vues (les plus récentes d'abord : Adel 05/10/2026, une bulle qui vient de publier ne descend jamais derrière des inactifs)** → mes abonnements sans story (dernier connecté d'abord) → suggestions d'amis (liens, puis style) avec le bouton **« +👤 »** pour suivre directement (ou appui sur la bulle = profil) → **membres endormis tout à la fin** (aucune activité depuis plus de 14 jours : dernière connexion, dernier GARDER, dernière story ; RPC `keep_profiles_activity`) : un ancien abonné inactif ne passe **jamais** devant. Une suggestion suivie rejoint aussitôt mes abonnements.
6. **Enchaînement automatique.** La story finie, la prochaine story **non vue** (la plus récente) démarre sans appui. On s'arrête avec ✕ ou « REVENIR AU PROFIL ». Jamais de boucle sur les stories déjà vues.
7. **Accès.** Comptes réels uniquement : e-mail vérifié et compte non anonyme. Jamais en mode démo ni invité local. **Suggestions d'amis** : seulement après que l'utilisateur a fait son style musical (RPC serveur `keep_discovery_match_candidates`), profils de son style, jamais déjà suivis ni liés, jamais de story avant un lien.
8. **Musiques.** Un GARDER en **public** entre automatiquement en story 24 h ; le **privé** n'y entre jamais. Une musique **en vente** est toujours **masquée** (« Musique en vente », animation pochette mystère, jamais le vrai titre ni la jaquette, jamais en double avec sa version en clair) : la décision est prise par le **serveur** (`keep_story_masked_pins`). « Privé parce qu'en vente » et « masqué volontairement » sont deux états distincts, expliqués par une fenêtre dédiée.
9. **Mettre en story.** Bouton allumé tant qu'on peut ajouter, « Patiente… » pendant la vérification, confirmation « Mettre en story ? », message « Tu viens de l'ajouter… 24 heures », puis gris « déjà en story ». Une musique à moi déjà placée d'office (boutique) compte comme « déjà en story ».
10. **Chat.** Ventes lancées depuis le chat : 24 h (tâche serveur), prévenu à l'envoi, carte « OFFRE EXPIRÉE » ensuite. Conversation privée/groupe : messages éphémères 24 h et « effacer pour moi » (jamais le salon). Pastille verte/rouge de présence et « Vu / En attente ».

## 15. Bandelettes communicatives (décision d'Adel, 05/10/2026 — valable partout)

Les bandelettes lumineuses (accueil au repos et écran d'écoute) **ne sont jamais des listes de phrases figées**. Elles viennent de la bibliothèque composée `packages/mobile/src/services/tickerMessageLibrary.ts` (plus d'un million de combinaisons : ornement + introduction + règle/défi/communauté/match + clôture) et de la mémoire `tickerMemory.ts` qui évite de réafficher les derniers messages (jamais les mêmes à chaque connexion ni à chaque passage). Les **règles importantes du système** (FREE, GARDER public/privé, story 24 h, découvreur crédité, ventes 24 h, anti-pillage, quota, QR ordinateur…) y sont expliquées une par une. Pour ajouter une idée : ajouter une phrase dans la liste du type voulu (jamais un message complet en dur dans un écran). Aucun gros titre sur l'accueil au repos ; la bandelette n'est affichée que si l'écran fait au moins 700 px de haut.

## 16. Bulles de stories, robot et bandelette — compléments (décision d'Adel, 05/10/2026)

- **Un appui sur une bulle** : story d'abord (même déjà vue, pour la revoir) ; **sans story**, une **fiche rapide** s'ouvre par-dessus (suivre, voir le profil complet) — jamais une page de profil qui s'ouvre d'office. Dans le lecteur de story, toucher « Story de @x › » ouvre la même fiche.
- **Le robot du Tchat parle** (bulle à côté de lui, jamais une notification) : sessions en attente (+ vibration courte et son discret) ; plus de FREE / plus de Solo (au plus 2 fois par jour, 6 h d'écart, phrases variées) avec un appui qui mène aux sessions ou aux offres. Code : `robotCoachMessages.ts`, `robotCoachService.ts`, `useRobotMessageStore.ts`, `GlobalChatDock.tsx`.
- **Bandelettes** : toujours à l'intérieur des marges de l'écran, avec un contour arrondi complet (jamais collées au bord).

### §14 bis — Collection en vente = entière en story (Adel, 05/10/2026)
- Une collection mise en vente entre **en entier** dans la story de son vendeur pendant 24 h (20 titres → 20, 60 → 60, plafond technique 100/story), titres masqués (« Musique en vente »), jamais le vrai titre/jaquette. Source serveur : `keep_playlist_sale_story_tracks` (offre active, ouverte à l'acheteur, < 24 h).
- À l'achat, l'acheteur voit ce qu'il a déjà et ce qui lui manque (`loadPlaylistSaleOfferOverlap`) ; l'achat d'un doublon reste bloqué.
- Les musiques partagées en **conversation privée** ne vont JAMAIS en story (confidentialité) ; seules les musiques d'un salon public pourraient y entrer (non implémenté, IDEA-070).
- À faire (IDEA-071) : proposition de prix pour les titres manquants via notifications + robot, puis chat direct.

### §14 ter — Désabonnement et liste des vues (Adel, 05/10/2026)
- **Un utilisateur ne se désabonne d'un autre que depuis la PAGE PROFIL de celui-ci.** Jamais depuis une bulle de story, la fiche rapide, la liste des vues ou la liste « Reprises » (elles affichent « Voir le profil » / « ✓ Tu le suis »). Contrôle bloquant : `verify-product-contract.cjs`.
- La liste « Vues de ta story » montre, pour chaque spectateur : son nom, « A repris » (s'il a déjà repris un de tes morceaux — ce n'est pas un événement du jour) et un bouton **Voir le profil ›**. Plus de badge « Abonné ».

### §14 quater — Lecteur de story : règles de lecture (Adel, 05/10/2026)
- **Ancienneté** (décision d'Adel du 05/10, remplace « reste 24 h ») : une seule ligne verte « ⏱ il y a 29 min » / « il y a 2 h », SEULEMENT depuis quand la musique est en ligne ; jamais la durée restante (l'utilisateur sait qu'une story dure 24 h) ; rien d'autre en vert.
- **Étiquettes obligatoires** sur chaque musique d'une story d'un autre : « 💳 PAYANT · PAYPAL » (musique en vente) ou « 🎁 GRATUIT · POUR TON PROFIL » (musique publique à garder ; le coût en FREE reste dit dans l'indication « → garder · 3 FREE »). Jamais d'ambiguïté sur ce qui est payant.
- **Aucune phrase d'accroche** sur la story d'un autre ; le créateur crédité est le découvreur d'origine.
- **Bulles inactives** : un membre sans activité depuis plus de **7 jours** voit sa bulle (sans story) disparaître de la rangée, et revenir dès qu'il se reconnecte. Un membre avec une story n'est jamais masqué.
- Contrôle bloquant : `scripts/verify-product-contract.cjs` (contrat `storiesExperience`).

### §14 quinquies — Vues de story façon Instagram (Adel, 05/10/2026)
- Une vue ne compte qu'après 2 s de présence réelle ; ouverture/fermeture immédiate = aucune vue.
- Suivi : secondes passées, musiques vues (x/y), écoute démarrée, instant du départ (ping 10 s, fermeture, arrière-plan).
- Propriétaire : liste « Vues de ta story » = `@pseudo`, `● regarde maintenant` ou `parti il y a …`, `N s · x/y musiques · écouté/pas écouté`, « Voir le profil ›». Alerte latérale : « 👁 @x regarde ta story » puis « @x est parti · N s ».

### §14 sexies — Classement sur les bulles (Adel, 05/10/2026)
- Classement de la semaine (7 jours glissants) : 1 pt par partage en story, 3 pts par reprise de sa musique par un autre membre, 2 pts par nouvel abonné ; top 50 des profils publics (RPC lecture seule `keep_story_ranking`).
- Badge discret en haut à gauche de la bulle : 🥇🥈🥉 (top 3), ⭐ (top 10) ; minimum 3 points. Aucun badge si le classement est indisponible. Ne remplace ni le ✓ « vu » (haut droite) ni la pastille de présence (bas droite).

### §16 bis — Robot intelligent et jeune (Adel, 05/10/2026, IDEA-096)
- À l'ouverture de l'app (5 s après le démarrage, une fois par lancement et par compte) le robot dit UN message utile : solde FREE à 0 → « plus de FREE » (avec de quoi en gagner : Battle, parrainage) ; solde ≤ 3 → « il ne te reste que N FREE » + comment en gagner ; sinon un **salut jeune avec le pseudo** (« Salut @pseudo 👋 t'es motivé ? … va dire coucou dans le salon »). Un appui sur le salut ouvre le salon/Tchat ; solde bas/vide → Offres.
- Le robot s'agite (secousse amortie < 1 s) et fait vibrer le téléphone (sans son pour le salut). Jamais envahissant : salut 2 fois/jour max et 6 h d'écart, solde bas 1 fois/jour (12 h), solde vide 2 fois/jour (6 h). Phrases composées, jamais toujours les mêmes. Code : `robotCoachMessages.ts`, `robotCoachService.ts` (`robotWelcome`), `GlobalChatDock.tsx`.

### §14 septies — Stories en chapitres (Adel, 05/10/2026, IDEA-098)
- Chaque musique d'une story est un **chapitre**. Le propriétaire voit, par spectateur : « a vu N musiques sur M » (jamais « 1/16 », trop ambigu) et **le temps exact passé dans chaque chapitre** (de son arrivée à la musique suivante) : « Chapitres : 1 · 25 s  2 · 9 s » (4 au plus puis « … +N »).
- Le spectateur ne voit jamais ce suivi. Table `story_watch_sessions.chapters` (jsonb), RPC `keep_story_watch_chapters_ping` (fusion par chapitre, valeurs bornées) et `keep_my_story_viewers_v3` (réservée au propriétaire). Les anciennes fonctions (ping, v2) restent pour les téléphones pas encore à jour.

### §14 octies — Badge à débloquer (Adel, 05/10/2026, IDEA-103)
- Sur MA photo de profil (haut gauche) : **🔒** tant que je n'ai pas 3 points sur 7 jours ; un appui explique « il te manque N points » avec mon détail (partages en story, reprises, abonnés) et comment gagner (story +1, lien d'affiliation/profil partagé → abonnés +2, reprise de ma musique +3), avec le bouton « Mettre une musique en story ». Débloqué : ✨ (actif), ⭐ (top 10), 🥇🥈🥉 (top 3).
- Badges des autres bulles : plus lumineux (fond doré, contour et halo), ✨ ajouté pour les membres actifs du top 50 hors top 10. RPC lecture seule `keep_my_story_stats` (mon rang quel que soit mon rang).

### §14 nonies — Déblocage du badge (Adel, 05/10/2026, IDEA-104)
- Badge/classement : **offert 30 jours** (comptes existants : à partir du 05/10/2026), puis **1 parrainage validé OU une formule payante** pour le garder ; **jamais** appliqué au droit de poster une story. Fonction serveur `keep_story_badge_eligible` ; le classement public n'affiche que les profils éligibles ; `keep_my_story_stats_v2` donne mon état (éligible, jours offerts restants, parrainages validés, Premium).
- Popup du 🔒 : verrouillé → « Ton mois offert est terminé… parraine 1 ami ou prends Premium » avec boutons **Parrainer un ami** (partage du lien `…/KEEP/?ref=CODE`), **Voir les formules**, Fermer ; pendant le mois offert → « 🎁 Offert encore N jours » ; toujours : mon détail de points et **à quoi sert le classement** (visibilité → abonnés → communauté).
- Modèle économique : `docs/BUSINESS_SCENARIO.md`.

### §14 decies — Le cœur « j'aime » PARTOUT (Adel, 05/10/2026, IDEA-106/107)
- Un **cœur** (composant unique `TrackLikeButton`) dans TOUS les lecteurs de musique : Swipe des stories (y compris **musiques payantes** : le j'aime est la seule action gratuite), profils de membres, sessions, aperçu des **collections en vente** ; absent de ma propre collection (`likeMode="off"`). Il pulse (contour rose) tant que la musique n'est pas aimée, devient **rouge** une fois aimé (retour arrière si le serveur refuse), avec le nombre de j'aime dans une pastille. Un cœur rouge reste rouge : **aucune suppression depuis un lecteur** (garde-fou données protégées, `verify-data-preservation`) ; le retrait existe sur le profil d'un membre.
- Sur **ma** story : compteur « ❤ N » en face des vues (`likeMode="count-only"`).
- **Une seule table de données : `track_likes (profile_id, track_id)`**, déjà lue par l'algorithme (affinités musicales, notifications boutique) et par le profil d'un membre ; l'id enregistré est l'id réel (« sale:… » → id). Aucune nouvelle table : `story_likes` (créée puis abandonnée le même jour, jamais utilisée en production) est à ignorer.
- Usage prévu : signal de style musical et d'affinité des abonnés → proposer des musiques à installer sur son profil (payées en FREE) ; recommandations = à construire.

### §14 undecies — Réactions : aimer / ne pas aimer, partout où l'on swipe (Adel, 05/10/2026, IDEA-109)
- Composant unique `TrackLikeButton` : **cœur éteint gris** au départ (plus de contour qui pulse), **rouge** au toucher ; à côté un bouton **👎 « pas aimé »**. **Une seule réaction par musique**, définitive depuis un lecteur (garde-fou données protégées) ; le nombre de j'aime est dans une pastille.
- Petits messages d'encouragement (`likeNudges.ts`, ≥ 100 combinaisons par type, mots de jeunes, **jamais les mêmes** : mémoire des 8 derniers) : pendant l'écoute (9 s sans réaction), quand on **zappe sans réagir** (« tu n'as pas kiffé ? dis-le avec un 👎 »), après un j'aime / un pas aimé. Bulle courte sous la ligne des badges, 5 s, sans bloquer les appuis.
- Données : j'aime → `track_likes` (existante) ; pas aimé → `track_dislikes` (nouvelle, additive, visible par son auteur) ; le partageur lit des **compteurs** « ❤ N · 👎 M » sur sa story (RPC `keep_my_track_dislike_counts`, limitée aux musiques qu'il a partagées), jamais l'identité de qui n'a pas aimé.

### §14 duodecies — Réactions en 3 choix « 3D » (Adel, 05/10/2026, IDEA-110) — remplace le cœur gris + 👎 de §14 undecies
- Trois boutons glossy en perspective (`TrackLikeButton`) : **👎 pas aimé · 😐 bof · ❤ aimé**. Tant qu'on n'a pas réagi, ils **flottent doucement** (bascule 3D, décalés de 0,38 s) pour qu'on comprenne qu'on peut donner son avis ; immobiles si « réduire les animations ».
- **Une réaction par musique** : déjà réagi (même lors d'une visite précédente) → seul le bouton choisi reste **allumé** (rouge / ambre / violet), **on ne redemande pas** (pas de message d'encouragement non plus) ; pas de retrait depuis un lecteur (garde-fou données protégées).
- Le partageur voit sur sa story « ❤ N · 😐 K · 👎 M » (compteurs, jamais l'identité). Données : ❤ → `track_likes` ; 😐 / 👎 → `track_dislikes.reaction` (`MEH` / `DISLIKE`) ; RPC `keep_my_track_reaction_counts` (limitée aux musiques que j'ai partagées).
- Messages d'encouragement : un type supplémentaire « après un bof ».
- **Popup « Donne ton avis 😉 »** (IDEA-111) : 1,4 s après chaque nouvelle musique, une petite bulle jaune sous les trois boutons (« Donne ton avis 😉 », « Tu en penses quoi ? 😏 »…, 64 variantes) apparaît, reste ~3 s puis disparaît seule ; jamais si l'utilisateur a déjà réagi ; elle s'efface dès qu'il réagit. L'en-tête du lecteur passe au-dessus du corps (`zIndex`) pour qu'elle reste visible.
