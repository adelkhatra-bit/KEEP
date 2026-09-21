# KEEP — Contexte actif

Dernière mise à jour : 21 septembre 2026.

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

- Mémoire partagée `.context/` mise en place pour Claude Code, Codex, Cursor et les autres agents ayant accès au dépôt.
- Audit desktop ciblé du site public terminé ; aucune refonte visuelle n'a été appliquée car le design et la navigation sont verrouillés sans accord explicite.

## État du projet

- Dépôt : `adelkhatra-bit/KEEP`.
- Branche active unique : `reconcile/claude-main-20260825`.
- Site public : `https://adelkhatra-bit.github.io/KEEP/`.
- Le site utilisateur est l'export Expo Web de `packages/mobile`, pas une application web séparée.

## Derniers changements

- Loki Swipe : autoplay fiabilisé, arrêt immédiat de l'extrait précédent au swipe et bouton de repli si le navigateur bloque la lecture (`daa846577a1eac2fd0632e18cd213c8ffe30313e`).
- Le jeton Apple Music utilisateur est isolé par profil afin d'éviter le partage de session entre comptes sur un même appareil.
- Le chemin GARDER est centralisé : contrôle de crédit, décision KEEP et synchronisation playlist passent par les services partagés, sans débit client isolé.
- La mémoire partagée est désormais référencée par `CLAUDE.md` et `AGENTS.md`.

## Décisions récentes

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

1. Obtenir l'accord explicite d'Adel avant de modifier `App.tsx`, `Navigation.tsx`, la barre des cinq onglets ou le responsive visuel.
2. Ajouter dans la même application des paliers `< 768`, `768–1199` et `>= 1200 px` : navigation latérale desktop, contenu centré (maximum 1180–1280 px) et grilles adaptatives.
3. Traiter d'abord Profil, Playlists, Découvertes et Soirées en colonnes/grilles ; conserver Loki Swipe dans une largeur contrôlée.
4. Ajouter les interactions web attendues : clavier, focus visible, survol et rôles accessibles.
5. Après le responsive, décider si l'installation PWA apporte une valeur suffisante, puis ajouter manifest, icônes, stratégie de cache et page hors-ligne.
6. Vérifier toute refonte sur Chromium et Firefox desktop, puis Chromium Android et WebKit iPhone.

## Points de vigilance

- Ne pas toucher à Battle, Marketplace ou aux autres modules pour la refonte desktop sans demande dédiée.
- `expo-av` est déprécié : prévoir une migration séparée vers `expo-audio`, sans la mélanger à une correction fonctionnelle urgente.
- Les échecs CI historiques liés aux sélecteurs navigateur, au contraste d'autres écrans ou aux identifiants Apple/EAS sont hors du correctif Loki Swipe et doivent être traités dans des tâches séparées.
