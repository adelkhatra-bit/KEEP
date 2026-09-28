# KEEP — Contexte actif

Dernière mise à jour : 28 septembre 2026 — 22:40 UTC (session AUDIT COMPLET + UX FIXES).

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

- **AUDIT COMPLET + PLAN D'ACTION (Demande Adel 28/09/2026 — "ne reviens pas tant que c'est pas fait")** :
  - **UX FIX PHASE 1 (EN COURS)** :
    - ✅ OnboardingScreen "Créer mon compte" button : Redesigned avec bordure visible (commit 3423caf)
    - ✅ ProfilePublicScreen MotionActionButton : Fixed prop validation errors (2 occurrences) (commit b336535)
    - ✅ TypeScript compile : 0 errors
    - ⏳ GitHub Pages deployment : En cours (devrait terminer dans ~5 min)
  - **SOLO SYSTEM PHASE 1 (PARTIAL)** :
    - ✅ Backend RPC `keep_battle_solo_daily_status` : Migration créée
    - ✅ Service `loadKeepBattleSoloDailyStatus()` : Implémentée
    - ✅ UI badge "SOLOS: X/Y" : Codée
    - ✅ Remove Free cost check for SOLO : Logique corrigée
    - ⏳ Production deployment : En attente du workflow web
    - 🔴 RPC application status : À vérifier si migration Supabase production appliquée
  - **TODO PHASES 2-5** :
    - [ ] Phase 2 : Super Admin SOLO config (12h)
    - [ ] Phase 3 : Collections bugs (36h)
    - [ ] Phase 4 : UI/UX notifications (24h)
    - [ ] Phase 5 : Audit + QA (12h)

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


## Collections System — Phase 1→2 (28/09/2026)

**Phase 1 - IDENTIFY (complétée 27/09)** : 7 bugs Collections documentés dans ERROR_LEDGER.md (ERR-COLLECTIONS-VISIBILITY-018 → ERR-COLLECTIONS-DESIGN-3D-024).

**Phase 2 - TESTS (complétée 28/09)** : Audit statique du code + calcul empirique.
- **REPRODUCIBLE CONFIRMED** : bugs 018, 020, 022, 023, 024 (audit code BD/RPC/UI + mesure pixels layout + vérif animations)
- **À TESTER SUR DEVICE RÉEL** : bugs 019 (bouton × Retirer), 021 (ordre incohérent)
- Document reproduction : `docs/COLLECTIONS_TEST_REPRODUCTION.md`
- ERROR_LEDGER.md mis à jour avec statuts et preuves audit

**Phase 3 - REPAIR (en attente)** : Commencer par les bugs auditables (pas de colonne BD = impact haut priorité).

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


## 2026-09-24 — Design profil Styles validé
- Source de vérité UX : `docs/PROFILE_STYLE_COMMERCE_REDESIGN.md`.
- Maquette à brancher : `docs/mockups/ProfileStylesMarketplace.html`.
- Audit global : `docs/audit/AUDIT_UX_FUNNEL_20260924.md`.
- Prochaine intégration : remplacer la longue liste comme vue principale par les dossiers Styles, conserver `Voir tous les morceaux`, ajouter `INVITER/PARTAGER` + `GÉRER MES VENTES` au hero propriétaire, lier chaque dossier payant à sa vraie offre.
- Coordination : `Loki Music Agent` a été repéré sur les commits CI/App Store ; ne pas écraser ses changements. Relire HEAD avant chaque modification.


## 2026-09-24 — Handoff intégration UI vers Loki Music Agent / Abacus-Claude
- Branche unique : `reconcile/claude-main-20260825` ; ne jamais intégrer cette refonte sur `main`.
- Adel demande un seul intégrateur UI pour éviter les collisions : Loki Music Agent / Abacus-Claude prend l’intégration ; ChatGPT Sol se retire du code UI pendant ce handoff.
- Lire avant action : `AGENT_MESSAGES.md`, `docs/PROFILE_STYLE_COMMERCE_REDESIGN.md`, `docs/mockups/ProfileStylesMarketplace.html`, `docs/audit/AUDIT_UX_FUNNEL_20260924.md`.
- Conserver les commits UI déjà présents : `654ed541`, `ca41db86`, `a9ddb531` ; les auditer avant toute réécriture.
- Ordre : profil visité → profil propriétaire → MyMusic → PlaylistSalePanel → onboarding → Super Admin → tests 390×844/web.


## 2026-09-27 — Poste de commandement inter-IA
- Porte d’entrée canonique : `docs/AGENT_COMMAND_CENTER.md`.
- Configuration machine-lisible : `.github/agent-command-center.json`.
- Triage automatique : `.github/workflows/agent-command-triage.yml`.
- Premier run réel du triage : GitHub Actions run `36316053776` = **SUCCESS** sur `572a431a92b765c108ff0fa6e5c7b8e77d208d37`.
- Toute IA doit conserver la branche unique `reconcile/claude-main-20260825`, utiliser le verrou/journal existants et respecter les états LOCAL_ONLY → COMMITTED_LOCAL → PUSHED_REMOTE → TESTED_REMOTE → DEPLOYED.
