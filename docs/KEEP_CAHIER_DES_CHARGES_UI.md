# KEEP — Cahier des charges UI / source de vérité

Sous-spécification du cahier des charges maître : `docs/KEEP_MASTER_SPEC.md`. En cas d'évolution validée, les deux fichiers doivent rester cohérents.

Version : **2026-10-01.3**  
Branche produit unique : **`reconcile/claude-main-20260825`**  
Ce document est la référence à relire avant toute modification d'interface.

## 1. Règle d'intégration

Toute modification doit conserver les modules déjà validés. Une IA ne doit pas déplacer, dupliquer, renommer ou supprimer un module existant simplement parce qu'elle intervient sur une autre fonction. Si un changement touche une zone voisine, elle doit d'abord vérifier ce cahier des charges et les contrats automatiques.

La CI exécute `scripts/verify-ui-layout-baseline.cjs`. Si une règle ci-dessous est cassée, l'intégration doit échouer.

## 2. Profil propriétaire — disposition verrouillée

Dans l'en-tête du profil propriétaire :

- Avatar à gauche.
- Pseudo + certification au-dessus.
- Le badge de type **Utilisateur / Créateur / DJ / Artiste / Producteur / Établissement** reste dans la zone identité.
- La certification reste toujours visible à côté du pseudo.
- **FREE est immédiatement à droite du badge de type**, une seule fois.
- Battle reste dans la même zone d'identité, à droite.
- Ville / pays restent sous cette ligne.
- La barre suivante reste : **PLUS | Abonnés | Reprises**.
- Aucun FREE ne doit être dupliqué dans cette barre.
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
- `packages/mobile/src/screens/__tests__/ProfileMetricsLayout.contract.test.ts` : garde FREE à côté du type + absence de doublon dans les métriques.
- `packages/mobile/src/screens/__tests__/ProfileOwnerMetricsLayout.contract.test.ts` : certification/type/FREE/Battle + ordre PLUS/Abonnés/Reprises.

## 8. Pépites / Collections

- L'écran Pépites sépare visuellement **TOUTES / ⚡ FREE / € EUROS**.
- Créer une collection suit trois étapes lisibles : **1. morceaux · 2. mode + prix · 3. paiement/publication**.
- Les morceaux déjà présents dans une collection publiée portent le repère **DÉJÀ PUBLIÉE** ; un appui explique le doublon et propose de gérer la collection existante.
- Le formulaire de publication est scrollable et suffisamment large sur téléphone comme sur desktop.
- En euros, le lien PayPal.Me ou autre lien HTTPS se configure directement dans le parcours ; aucun bouton ne doit pointer vers une route inexistante.
- En FREE, aucun lien bancaire n'est demandé.
