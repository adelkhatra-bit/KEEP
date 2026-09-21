# KEEP — Contexte actif

Dernière mise à jour : 21 septembre 2026.

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

- Mémoire partagée `.context/` mise en place pour Claude Code, Codex, Cursor et les autres agents ayant accès au dépôt.
- Audit exhaustif des profils mobile personnel (`ProfilePublicScreen.tsx`) et public visité (`PublicUserProfileScreen.tsx`) validé.
- Design system écrit dans `DESIGN_SYSTEM.md` et direction visuelle mobile validée par Adel.
- Spécification visuelle commune des deux profils mobile formalisée dans `docs/PROFILE_MOBILE_REDESIGN.md` pour éviter toute divergence entre agents.
- Prochaine étape autorisée : préparer la refonte du profil personnel mobile en premier, sans suppression de fonctionnalité et sans toucher à `App.tsx` ni `Navigation.tsx`.

## État du projet

- Dépôt : `adelkhatra-bit/KEEP`.
- Branche active unique : `reconcile/claude-main-20260825`.
- Site public : `https://adelkhatra-bit.github.io/KEEP/`.
- Le site utilisateur est l'export Expo Web de `packages/mobile`, pas une application web séparée.

## Derniers changements

- `DESIGN_SYSTEM.md` ajouté et validé : palette KEEP, typographie, espacements, composants, micro-interactions et accessibilité (`c0c57620b459fccb3b3e8fb8ba7b2f8d5f8ecfb5`).
- Loki Swipe : autoplay fiabilisé, arrêt immédiat de l'extrait précédent au swipe et bouton de repli si le navigateur bloque la lecture (`daa846577a1eac2fd0632e18cd213c8ffe30313e`).
- Le jeton Apple Music utilisateur est isolé par profil afin d'éviter le partage de session entre comptes sur un même appareil.
- Le chemin GARDER est centralisé : contrôle de crédit, décision KEEP et synchronisation playlist passent par les services partagés, sans débit client isolé.
- La mémoire partagée est désormais référencée par `CLAUDE.md` et `AGENTS.md`.

## Décisions récentes

- Refonte profil : mobile uniquement pour cette phase.
- Zéro suppression : chaque donnée, action, état, modale et raccourci existant doit rester accessible, au maximum en 1–2 taps.
- Hiérarchie validée : identité compacte, SWIPE prioritaire, collection avant les sections Communauté, Progression, Battle, Loki DNA et Réseaux.
- Chaque ligne de musique doit conserver le pseudo du découvreur/utilisateur, son statut de suivi/certification et l'accès à son profil : c'est le principe social d'origine de KEEP.
- La cloche Notifications et son compteur restent visibles dans la barre supérieure du profil, hors du menu hamburger.
- La barre inférieure globale reste visible et inchangée sur les profils avec ses cinq onglets `Écouter`, `Découvertes`, `Playlists`, `Soirées`, `Profil` ; le contenu doit réserver sa hauteur et la safe area.
- Couleurs critiques immuables : violet KEEP `#7C5CFC`, GARDER/succès `#2DE1C2`, PASSER/danger `#FF5C72`.
- Écouter, reconnaître et PASSER coûtent `0 Free`.
- GARDER un titre découvert via Écouter coûte actuellement `3 Free` ; cette valeur vient de la configuration serveur. Une copie sociale depuis le profil d'un autre membre coûte `0 Free`.
- Le socle gratuit est actuellement de `3 Free` invité + `20 Free` après création du compte, avant bonus éventuels.
- Un compte exige pseudo, mot de passe et e-mail vérifié ; la connexion accepte pseudo ou e-mail.
- Une seule application mobile/web et une seule chaîne GitHub Pages sont autorisées. Ne pas créer un second site desktop.
- L'expérience desktop doit être construite comme une couche responsive dans l'application Expo/React Native Web existante. Une PWA améliore l'installation et le hors-ligne, mais ne corrige pas à elle seule l'ergonomie desktop.

## Résultat de l'audit desktop

- Point d'entrée : `packages/mobile/index.js` → `packages/mobile/App.tsx` → `packages/mobile/src/navigation/Navigation.tsx`.
- Le conteneur web est fixé à `100dvh` avec overflow masqué pour stabiliser les navigateurs mobiles ; ce comportement limite le défilement naturel sur desktop.
- La barre mobile à cinq onglets reste en bas sur grand écran et occupe toute la largeur.
- Les contenus internes s'étirent presque bord à bord, sans largeur maximale, grille ni hiérarchie desktop.
- Plusieurs textes et libellés restent calibrés pour mobile, autour de 10–14 px.
- Certaines actions tactiles n'exposent pas une sémantique de bouton web suffisante ; les états clavier, focus et survol doivent être renforcés.
- Le site expose des métadonnées « application mobile », mais aucun manifest web ni service worker durable : ce n'est pas encore une vraie PWA.

## Prochaines étapes immédiates

1. Reprendre l'inventaire exhaustif validé avant toute modification de `ProfilePublicScreen.tsx`.
2. Refaire uniquement la hiérarchie visuelle du profil personnel mobile selon `DESIGN_SYSTEM.md`, sans changer la logique métier.
3. Conserver les deux accès lorsque l'interface actuelle possède plusieurs raccourcis vers la même fonction.
4. Vérifier tous les états : invité, démo, authentifié, vide, chargement, erreur, public/privé, crédits, Battle, vente et feature flags.
5. Faire valider le profil personnel avant de modifier le profil public visité.
6. Tester typecheck, contrats profil, rendu mobile réel et non-régression des modales/Swipes.

## Points de vigilance

- Ne supprimer aucun texte explicatif : déplacer les contenus longs dans des panneaux `ⓘ`, accordéons ou sous-menus accessibles en 1–2 taps.
- Ne pas modifier `App.tsx`, `Navigation.tsx` ni la barre des cinq onglets.
- Ne pas toucher à Battle, Marketplace ou aux autres modules pour la refonte desktop sans demande dédiée.
- `expo-av` est déprécié : prévoir une migration séparée vers `expo-audio`, sans la mélanger à une correction fonctionnelle urgente.
- Les échecs CI historiques liés aux sélecteurs navigateur, au contraste d'autres écrans ou aux identifiants Apple/EAS sont hors du correctif Loki Swipe et doivent être traités dans des tâches séparées.
