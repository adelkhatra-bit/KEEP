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
