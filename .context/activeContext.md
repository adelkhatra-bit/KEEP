# KEEP — Contexte actif

Dernière mise à jour : 23 septembre 2026 (session Codex).

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

- **Robustesse des audits web publics / GitHub Actions — CODÉE, TESTÉE, POUSSÉE (branche Copilot)** :
  - `packages/mobile/src/screens/onboarding/OnboardingScreen.tsx` : ajout d'un `testID="onboarding-trial-button"` + `accessibilityLabel="Essayer gratuitement"` stable pour l'essai gratuit public.
  - `scripts/keep-public-trial-smoke.cjs` : sélecteur Playwright durci (testID/label/role/texte), tolérance si le mode invité est déjà restauré, et alignement des assertions avec le branding/flow Creator Pro actuels (`Loki Music`, badge de déblocage profil, route `offers?focusPlan=CREATOR_PRO`).
  - `.github/workflows/mobile-web-importmeta-diagnostic.yml` : helper `clickRobust()` ajouté pour fiabiliser le clic vers `Profil` après suppression malgré les overlays qui interceptent les pointeurs.
  - `.github/workflows/web-preview-pages.yml` : ajout d'une vraie assertion Playwright sur la préservation de la route métier après chargement puis reload (y compris `/superadmin/` → `/admin-preview/` et `/share-profile/`).
  - Validations : `npm ci`, `npm --workspace packages/mobile run type-check`, `node scripts/verify-source-of-truth.cjs`, vérifications `git diff --check` + syntaxe YAML/JS, scan secrets OK, contrôle navigateur local Chromium OK (rendu non blanc + route Offers Creator Pro atteinte).

- **Refonte layout 3 écrans (spec textuelle validée d'Adel, 22/09/2026) — CODÉE, TESTÉE, POUSSÉE** :
  - `HomeScreenCompact.tsx` : commit `8cd3a09` — ordre vertical strict (titre 28px, waveform menthe animée 120px via prop `size` de SessionPulse, accroche 24px, sous-titre 14px gris, bouton ÉCOUTER 52px/80%, lien ghost 13px), espacements 24px, nouveau token `colors.textMutedGrey` (#A0A0B0, dérogation Adel).
  - `DiscoverScreen.tsx` : commit `d85c8d9` — pochette 220×220, badge affinité sur pochette, titre 22px, bio 16px gris, chips genres, 3 boutons PASSER/SUPER/GARDER (GARDER = follow via RPC sécurisées `keep_follow_profile`/`keep_unfollow_profile`).
  - `PartiesScreen.tsx` : commit `2767c3a` — hero gradient violet 180px, badge EN COURS pulsant, titre 24px + lieu/horaire 14px gris, RSVP "J'y vais"/"Je passe" 48px, grille participants 48×48, sous-onglets Lobby/Classement/Playlist (Classement = leaderboard partagé `renderLeaderboard` + ligne utilisateur surlignée violet ; Playlist = état vide, pas de données playlist événement dans le code).
  - Tests verts avant push : tsc 0 erreur, jest 255/255, verify-source-of-truth OK.
- **Builds iOS TestFlight** :
  - Build 1 (couleurs `d7df56a`) : run GitHub Actions `35744403068`, déclenché 15:01 UTC.
  - Build 2 (refontes, HEAD `2767c3a`) : run `35748916845`, déclenché 15:39 UTC.
  - Numéros de build TestFlight à confirmer quand les builds seront soumis (30-60 min).
- Les maquettes HTML des 3 écrans sont perdues (session précédente) — remplacées par la spec textuelle validée d'Adel.

## État du projet

- Dépôt : `adelkhatra-bit/KEEP`.
- Branche active unique : `reconcile/claude-main-20260825`.
- Site public : `https://adelkhatra-bit.github.io/KEEP/`.
- Le site utilisateur est l'export Expo Web de `packages/mobile`, pas une application web séparée.

## Derniers changements

- `d7df56a` : migration couleurs HomeScreenCompact/Discover/Parties vers tokens colors.ts (Claude Code, 22/09 13:59 UTC).
- `8cd3a09`, `d85c8d9`, `2767c3a` : refontes layout des 3 écrans (Codex, 22/09).
- `1009c5b` : régénération PROJECT_STATE.md.
- Poste de commandement GitHub-native IA ajouté : `docs/ops/GITHUB_AI_COMMAND_CENTER.md`, `config/github-ai-command-center.json`, templates d'issues/PR structurés et labels GitHub normalisés (Codex, 23/09).
- Workflow de triage automatique agents/labels en place : `.github/workflows/agent-command-triage.yml` applique les labels type/agent et publie un commentaire de routage avec workflows recommandés (Codex, 23/09).
- Suite du poste de commandement IA : workflow de triage automatique des issues `.github/workflows/agent-command-triage.yml`, matrice de déblocage externe `docs/ops/EXTERNAL_PLATFORM_UNLOCK_MATRIX.md` et durcissement de `.github/agents/config.yml` pour supprimer le faux accès total (Codex, 23/09).

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

1. Confirmer les numéros de build TestFlight des 2 runs (35744403068, 35748916845) quand soumis.
2. Vérifier dans un vrai navigateur que le rendu web des 3 écrans refondus n'est ni blanc ni en erreur console (protocole Adel).
3. Playlist d'événement : pas de données dans le code actuel — l'onglet Playlist affiche un état vide ; à valider avec Adel si une vraie playlist événement doit être créée (nouvelle fonctionnalité).
4. Faire valider côté humain les accès/apps/secrets externes non automatisables du poste de commandement GitHub-native IA.

## Points de vigilance

- Ne pas modifier `App.tsx`, `Navigation.tsx` ni la barre des cinq onglets.
- `expo-av` est déprécié : prévoir une migration séparée vers `expo-audio`.
- Le token GitHub de l'app n'a pas la permission `workflows` (push de fichiers `.github/workflows/*` rejeté) — les builds sont déclenchés via `workflow_dispatch` (API REST, token du credential manager Windows).
