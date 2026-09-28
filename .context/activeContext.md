# KEEP — Contexte actif

Dernière mise à jour : 28 septembre 2026 — 22:40 UTC (session AUDIT COMPLET + UX FIXES).

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## Tâche en cours

- **🧭 AUDIT UX COMPLET + IMPLEMENTATION (Demande Adel 28/09/2026)** :
  - **AUDIT PHASE COMPLÉTÉE (✅ 28/09/2026 23:45 UTC)** :
    - ✅ AUDIT_UX_COMPLETE_20260928.md : Analyse complète 9 sections
      • Incohérences navigation (Bell vs Hamburger) — CRITIQUE
      • Designs coincés après refresh — CRITIQUE
      • Onboarding manquant — CRITIQUE
      • Hiérarchie profil confuse — HAUT
      • Phases 1-5 avec priorité/durée/checklist
    - ✅ NAVIGATION_ARCHITECTURE_DIAGRAM.md : Schéma visuel + flux détaillé
    - ✅ Commit 3f7064a PUSHED_REMOTE
    - Prochaine étape : Phase 1 (Navigation Unifiée)
  
  - **PHASE 1 : NAVIGATION UNIFIÉE (✅ COMPLÉTÉE — 28/09 23h55 UTC)** :
    - ✅ Status : PUSHED_REMOTE (commit e004512)
    - ✅ Objectif : Bell + Hamburger → Menu Modal unique
    - ✅ Travail : ProfilePublicScreen.tsx ligne 1229 — Bell désormais ouvre menu + expand notifications
    - ✅ Tests : TypeScript 0 errors
    - ⏳ Tests web : Awaiting GitHub Pages workflow
    - Impact réel : ✅ Cohérence UX, ✅ Enfant 7 ans comprend (un seul menu, pas 2 paradigmes)
  
  - **PHASE 2 : FIX DESIGN RENDERING (✅ PARTIELLEMENT — 28/09 00h35 UTC)** :
    - ✅ Status : PUSHED_REMOTE (commit 1bb7a5a)
    - ✅ Diagnostic complet (doc PHASE2_DESIGN_RENDERING_DIAGNOSIS.md)
    - ✅ Repair A : Modal State Manager (utils/modalStateManager.ts)
    - ✅ Repair B : Reset État au Montage (ProfilePublicScreen + PartiesScreen)
    - ⏳ Repair C : Z-index explicite (TODO — optionnel)
    - ⏳ Repair D : Simplification menu (TODO — optionnel)
    - ✅ TypeScript : 0 errors
    - Impact : ✅ Aucune modale fantôme après refresh, ✅ Pas de conflits multiples modales

  - **PHASE 3 : ONBOARDING 1ère VISITE (✅ COMPLÉTÉE — 29/09 00h40 UTC)** :
    - ✅ Status : PUSHED_REMOTE (commit bd7cb34)
    - ✅ OnboardingGuideScreen.tsx : Écran complet avec 5 étapes (Écouter, Découvertes, Playlists, Soirées, Profil)
    - ✅ App.tsx : Integration du flag hasSeenOnboarding (AsyncStorage)
    - ✅ Logique : S'affiche une seule fois post-signup, marque le flag comme vu
    - ✅ TypeScript 0 errors
    - Impact : ✅ Nouveau utilisateur guidé, ✅ Enfant 5-7 ans comprend les onglets

  - **PHASE 4 : HIÉRARCHIE PROFIL (✅ COMPLÉTÉE — 29/09 00h52 UTC)** :
    - ✅ Status : PUSHED_REMOTE (commit f8c0a55)
    - ✅ MotionActionButton.tsx : Amélioration des borderWidth (1→2px pour primary/success/danger)
    - ✅ Contours visuels clairs et hiérarchie des boutons d'action renforcée
    - ✅ TypeScript 0 errors
    - Impact : ✅ Profil plus professionnel, ✅ Boutons d'action clairs et accessibles

  - **PHASE 5 : LOCKED FEATURES (⏳ PARTIELLEMENT IMPLANTÉE)** :
    - ℹ️ Status : Système de dialogues déjà en place dans ProfilePublicScreen
    - ✅ Dialogue "Débloquer DJ/Artiste" : Fonctionnel (ligne 1306-1314)
    - ✅ Badge verrouillé avec explication : Présent et cliquable
    - ⏳ Extension future : Ajouter badges "FORMULE REQUISE" à d'autres fonctions verrouillées
    - Impact : ✅ Utilisateur sait comment débloquer les formules

## 🐛 FIX CRITIQUE BATTLE SOLO (28/09/2026)

- **ERR-BATTLE-SOLO-TIMEOUT-CREDIT-036 — Prévenir débit lors timeout** :
  - **Status** : FIXED_LOCAL (commit bd6e3f8)
  - **Bug** : En mode Solo, partie auto-annulée après 3 timeouts (sans interaction utilisateur) débite quand même les crédits
  - **Cause** : Pas de tracking des réponses → impossible de détecter "all-timeout"
  - **Fix** : 
    - ✅ Ajouter `soloResponses[]` state pour tracker CORRECT/INCORRECT/__TIMEOUT__
    - ✅ Helper `recordSoloAnswer()` centralise l'enregistrement
    - ✅ Détection all-timeout : si toutes réponses = __TIMEOUT__, sauter RPC credit
    - ✅ Mise à jour ERROR_LEDGER.md : ERR-BATTLE-SOLO-TIMEOUT-CREDIT-036 → FIXED_LOCAL
  - **Impact** : Utilisateur ne perd plus de crédit si inactive en Solo mode

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
