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
5. **Ordre de la ligne** : stories non vues (la plus récente d'abord) → membres liés avec story → mes abonnements sans story (dernier connecté d'abord) → suggestions d'amis (liens, puis style) avec le bouton **« +👤 »** pour suivre directement (ou appui sur la bulle = profil) → stories vues → **membres endormis tout à la fin** (aucune activité depuis plus de 14 jours : dernière connexion, dernier GARDER, dernière story ; RPC `keep_profiles_activity`) : un ancien abonné inactif ne passe **jamais** devant. Une suggestion suivie rejoint aussitôt mes abonnements.
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
