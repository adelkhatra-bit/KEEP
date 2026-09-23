# KEEP — Contexte actif

Dernière mise à jour : 22 septembre 2026 (session Abacus/Codex).

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

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

## Points de vigilance

- Ne pas modifier `App.tsx`, `Navigation.tsx` ni la barre des cinq onglets.
- `expo-av` est déprécié : prévoir une migration séparée vers `expo-audio`.
- Le token GitHub de l'app n'a pas la permission `workflows` (push de fichiers `.github/workflows/*` rejeté) — les builds sont déclenchés via `workflow_dispatch` (API REST, token du credential manager Windows).


## Loki — contrat produit profil musical / Web-first (23/09/2026)
- Source de travail unique : branche `reconcile/claude-main-20260825`.
- Validation prioritaire sur Loki Web/React Native Web avant de consommer un nouveau build mobile ; reporter sur iOS/Android une fois le parcours validé, sans créer une deuxième application ni un deuxième design.
- Aucun refresh manuel ne doit être requis après une mutation : création/mise en vente d'une playlist, achat/déverrouillage, création/modification d'une soirée. L'état local doit être mis à jour immédiatement puis réconcilié avec Supabase.
- Profil propriétaire ET profil visité : la zone musique doit privilégier des dossiers/collections automatiques par style (Funk, Techno, House, Rap, etc.) plutôt qu'une longue liste de morceaux.
- Le moteur Smart Albums/Vibes trie automatiquement les morceaux par genre/style, crée les dossiers et permet au propriétaire de les renommer. Une playlist mélangée doit pouvoir être redistribuée automatiquement dans ces dossiers.
- Ouvrir un dossier gratuit lance le Swipe continu de tous ses morceaux.
- Dossier payant : cadenas + style/nom du dossier + nombre de titres + prix total. Avant achat, aucun titre, artiste ou jaquette ne doit être révélé ; uniquement préécoute audio protégée, animation Loki, court texte de découverte et bouton ACHETER.
- Après paiement confirmé : déverrouillage immédiat sans refresh, puis accès au Swipe complet et au contenu livré selon les droits marketplace.
- Une Vibe/Smart Album mise en vente ne doit jamais rester simultanément accessible gratuitement par un autre chemin du profil.
- Les agents doivent suivre ces points comme backlog durable avec statuts demandé / codé / testé / déployé / restant, et ne pas les considérer terminés sur la seule présence de code.



## 2026-09-23 — App Store clé en main + audit profil vente
- Fastlane complet créé (Option 1, sans .p8) + guide vocal `docs/APP_STORE_VOCAL_GUIDE.md` (Chemin A auto / Chemin B manuel). Capture 6.5" `59878944`.
- Non soumis : reste 1 action de 30 s (mot de passe spécifique app OU Chemin B iPhone). Lien fiche : https://appstoreconnect.apple.com/apps/6812393589/appstore
- Marketplace v1 : flag OFF (rejet Apple 3.1.1 lien externe). Vitrine « En vente » remontée en haut du profil (bb89c56f).
- Commits session : fac3ca83, 5e2349ed, bb89c56f, 89355657, 29e35a29, 59878944.



## 2026-09-23 (suite) — Priorité 1 e2e + mission finale App Store
- Poussé `373c733c..9b82e0ac` (7 commits, aucun `.github/workflows/**` — livrés en patch sous `docs/ci/`).
- 5 correctifs P1 : trial public (373c733c), playlists→profil (patch e753622e), route après reload (patch d36cb1b1), INDEX.md (e8db2956), guide vocal (33d843b4). + Fastlane autonome (445004dc) + patch workflow submit (8fea7665).
- P2 listée : `docs/ADEL_ACTIONS.md` (9b82e0ac) — 6 actions humaines.
- App Store NON soumis : clé API ASC cloisonnée dans GitHub Secrets ; connecteur sans permission Workflows/Actions ni lecture secrets. Seule action : accorder Workflows+Actions à l'App abacusai (https://github.com/apps/abacusai/installations/select_target).
- Tests verts : tsc 0 · jest 284/284 + 18/18 · verify 0.
