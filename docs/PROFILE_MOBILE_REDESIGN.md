# Refonte des profils mobile — référence commune

Statut : direction validée par Adel, prête pour implémentation. Ce document est le contrat visuel commun à Codex, Claude Code, Cursor et aux autres agents.

## 1. Règles non négociables

- Périmètre mobile uniquement : profil personnel puis, après validation, profil public visité.
- Zéro suppression : toutes les données, actions, explications, modales, états et raccourcis actuels restent accessibles en 1 ou 2 taps.
- Ne pas modifier `packages/mobile/App.tsx`, `packages/mobile/src/navigation/Navigation.tsx` ni la barre des cinq onglets.
- La barre inférieure globale reste visible et inchangée sur les profils : `Écouter`, `Découvertes`, `Playlists`, `Soirées`, `Profil`. Elle constitue la navigation principale de KEEP et doit apparaître dans toute maquette de profil.
- Le contenu défilant réserve la hauteur de cette barre et de la safe area : aucune ligne, action ou fin de section ne doit être masquée derrière elle.
- Ne pas changer la logique métier Battle, Marketplace, crédits ou Swipe pendant cette refonte.
- La collection musicale est le contenu principal du profil.
- Chaque morceau affiche directement le pseudo de l'utilisateur qui l'a découvert/ajouté, sa certification ou son état de suivi, et un accès à son profil. Ces informations ne vont pas dans un menu général.
- La cloche Notifications et son compteur restent visibles dans la barre supérieure du profil personnel, hors du menu hamburger.
- `DESIGN_SYSTEM.md` est la référence pour les couleurs, espacements, composants, animations et règles d'accessibilité.

## 2. Profil personnel mobile

Fichier actif : `packages/mobile/src/screens/ProfilePublicScreen.tsx`.

### A. Barre supérieure fixe

- À gauche : badge/statut `FREE` actuel, conservé.
- À droite : cloche Notifications avec compteur `99+` maximum, puis menu hamburger.
- La cloche ouvre les notifications en un tap. Elle ne doit jamais être déplacée dans le hamburger.
- Les deux cibles tactiles font au moins `44 × 44 px` et possèdent un libellé accessible.

### B. Identité compacte

- Avatar `64 px`, pseudo en titre, badge de certification, type de profil et statut public/privé.
- Ville/pays et biographie restent visibles sous l'identité, sur deux niveaux de texte au maximum avant expansion.
- La bannière ou l'alerte de compte reste affichée dans ses états actuels.
- Les informations secondaires existantes restent accessibles depuis `Voir les détails` si elles ne tiennent pas dans le bloc compact.

### C. Actions prioritaires

- Bouton principal pleine largeur `SWIPE`, violet KEEP.
- Bouton secondaire `PARTAGER LE PROFIL`, juste sous ou à côté selon la largeur disponible.
- Tout raccourci existant vers une même fonction est conservé à son emplacement logique.

### D. Collection — première grande section

- Titre `Ma collection` avec compteur total et bouton de filtre.
- Onglets visibles : `Musiques`, `Vibes`, `Artistes`.
- Une liste verticale est utilisée sur mobile pour conserver la lisibilité et toutes les actions.

Chaque ligne de musique contient :

- pochette `56 px`, bouton lecture/pause, titre et artiste ;
- ligne sociale visible : `Découvert par @pseudo` ou le libellé équivalent déjà fourni par les données ;
- certification et état de suivi du découvreur, avec accès direct à son profil ;
- statut actuel du morceau et actions disponibles : partage, impact, GARDER/PASSER ou menu contextuel selon le cas existant ;
- prix ou état de vente lorsqu'il existe, sans modifier la logique Marketplace.

Les onglets `Vibes` et `Artistes` conservent leurs contenus, leurs états dépliés, leurs compteurs et leurs actions Swipe/partage actuelles.

### E. Offres et ventes

- Les offres actives et informations de vente actuelles restent visibles après la collection.
- Le prix est mis en avant ; les actions ouvrent les modales existantes.
- Aucun parcours d'achat ou de mise en vente n'est réécrit dans cette phase.

### F. Sections secondaires en accordéons

Ordre proposé :

1. `Communauté` : morceaux, abonnés, abonnements, reprises et listes associées.
2. `Progression` : niveau, objectifs, barres, badges, textes explicatifs et récompenses.
3. `Battle` : disponibilité, statistiques, règles, inscriptions et raccourcis existants.
4. `Loki DNA` : résultat, explication, partage et états incomplets.
5. `Réseaux et liens` : site web, plateformes musicales et réseaux sociaux.

Chaque en-tête affiche un résumé utile et un chevron. Un tap déplie le contenu sur place ; une action profonde peut ouvrir la modale ou l'écran existant au second tap.

### G. Menu hamburger

- Conserver toutes les rubriques et tous les panneaux actuels, dans le même périmètre fonctionnel.
- Le menu regroupe les réglages, outils créateur, offres/crédits, aide/légal et actions de compte.
- Notifications n'y est pas déplacé : la cloche reste toujours visible dans la barre supérieure.
- Les actions sensibles gardent leurs confirmations et leurs états désactivés/chargement actuels.

### H. Barre de navigation globale

- Toujours présente en bas avec ses cinq destinations actuelles : `Écouter`, `Découvertes`, `Playlists`, `Soirées`, `Profil`.
- L'onglet `Profil` est visuellement actif sur le profil personnel.
- Aucun nouvel onglet, changement de libellé, déplacement ou nouvelle logique de navigation dans cette refonte.
- Le dernier contenu du profil possède un padding inférieur suffisant pour rester entièrement visible au-dessus de la barre et de la safe area.

## 3. Profil public visité mobile

Fichier actif : `packages/mobile/src/screens/PublicUserProfileScreen.tsx`.

### A. Barre supérieure

- Retour à gauche.
- Partage et menu contextuel à droite.
- Le menu contextuel conserve les actions de signalement, blocage et modération actuellement disponibles selon l'état.

### B. Identité

- Avatar `64 px`, pseudo, certification, type de profil, lieu et biographie.
- États public/privé, suivi, indisponibilité, chargement et erreur restent explicitement représentés.
- Les textes longs se développent sur place sans masquer définitivement l'information.

### C. Actions sociales

- Bouton principal `SUIVRE` ou état `SUIVI`, avec la logique actuelle.
- Action `SWIPE` clairement visible pour explorer la collection publique.
- Partage accessible dans la barre supérieure et conservé ailleurs s'il existe déjà comme raccourci.

### D. Collection publique — première grande section

- Titre, compteurs et filtres actuels.
- Onglets ou catégories existants conservés, avec une liste verticale mobile.
- Chaque morceau affiche pochette, lecture, titre, artiste, statut et actions sociales disponibles.
- La ligne `Découvert par @pseudo` reste toujours visible, avec certification/état de suivi et accès au profil correspondant.
- Les actions GARDER, partage, like ou achat continuent d'utiliser leurs flux et modales actuels.

### E. Boutique et offres

- Les offres et éléments achetables existants suivent la collection.
- Prix, contenu, vendeur et CTA sont explicites ; aucun comportement Marketplace n'est changé.

### F. Sections secondaires

- `Communauté`, `Loki DNA`, `Réseaux et liens` et toute autre section actuelle sont conservés sous forme d'accordéons ou de cartes compactes.
- Les listes détaillées et explications sont accessibles en 1 ou 2 taps.
- Les actions de sûreté restent dans le menu contextuel de la barre supérieure.

### G. Barre de navigation globale

- La barre des cinq onglets reste visible, identique et fonctionnelle sur le profil public visité.
- Elle conserve `Écouter`, `Découvertes`, `Playlists`, `Soirées`, `Profil` et la destination active définie par la navigation existante.
- Le contenu ne doit jamais défiler ou se terminer sous cette barre.

## 4. États et comportements à préserver

- Invité, démo, authentifié, propriétaire et visiteur.
- Profil public, privé, incomplet, introuvable ou bloqué.
- Chargement, liste vide, erreur avec réessai et contenu disponible.
- Suivi/non-suivi, certification, crédits, vente, disponibilité Battle et feature flags.
- Lecture/pause audio, changement de morceau et arrêt lors d'un changement de contexte.
- Toutes les modales, confirmations, panneaux d'information et textes explicatifs actuels.

## 5. Direction visuelle

- Fond `#0B0A12`, sections `#151320`, lignes interactives `#1C1930`, bordures `#2A2640`.
- Violet KEEP `#7C5CFC` pour l'action principale et la sélection.
- Menthe `#2DE1C2` pour GARDER/succès ; corail `#FF5C72` pour PASSER/danger.
- Padding écran `16 px`, espacement de section `24 px`, cartes rayon `16 px`.
- Une seule action dominante par zone ; textes fonctionnels jamais sous `12 px` ; cibles tactiles au moins `44 × 44 px`.
- Animations discrètes : tap `120 ms`, accordéon `220 ms`, respect de `Reduce Motion`.

## 6. Ordre d'implémentation et validation

1. Auditer le rendu réel et dresser une correspondance entre chaque élément actuel et sa nouvelle section.
2. Refaire uniquement `ProfilePublicScreen.tsx`, sans changer la logique métier.
3. Vérifier chaque état, modale, raccourci et action sur un petit et un grand téléphone.
4. Faire valider visuellement le profil personnel par Adel.
5. Refaire ensuite `PublicUserProfileScreen.tsx` selon le même système.

Critères de validation obligatoires :

- aucun élément de l'audit initial n'a disparu ;
- la collection est atteinte immédiatement après identité et actions principales ;
- chaque musique montre le pseudo du découvreur et permet d'ouvrir son profil ;
- la cloche Notifications et son compteur sont hors hamburger ;
- la barre inférieure des cinq onglets est visible, inchangée et ne masque aucun contenu ;
- toutes les fonctions restent accessibles en 1 ou 2 taps ;
- aucun changement dans `App.tsx`, `Navigation.tsx`, Battle, Marketplace ou crédits ;
- typecheck, contrats profil, tests existants et rendu mobile réel passent avant toute annonce de réussite.
