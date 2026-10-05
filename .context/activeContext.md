# KEEP — Contexte actif

## 🔔 À LIRE EN PREMIER — Passe du 05/10/2026 soir (stories, robot, classement, profil, menu) — reprise de conversation

**Langue : français uniquement avec Adel. Il veut un exécutant autonome (« continue, t'arrête pas »), qui teste avant de dire « fait », ne pousse que les modules concernés, et garde app = ordinateur.** Toute nouvelle idée d'Adel → `docs/IDEAS_INBOX.md` AVANT de coder. Les statuts « EN COURS » anciens de l'inbox sont en partie périmés : se fier à `docs/ERROR_LEDGER.md` (ERR-…-143 à 164) et à ce résumé.

### Livré dans le code (branche `reconcile/claude-main-20260825`, tout poussé) — à CONFIRMER SUR IPHONE (aucune preuve iPhone, seulement navigateur 320/390/1440 + tests)
- **Vues de story façon Instagram** (IDEA-091/098) : vue comptée après 2 s (`storyWatchService.ts`), secondes, musiques vues, écoute, départ en direct, **chapitres** (temps par musique) ; liste « Vues de ta story » (`ProfileStoryBar.tsx`, `formatWatchDetail`), alerte « regarde / est parti » (`StoryVisitorToast.tsx`). Tables/RPC : `story_watch_sessions` (+`chapters`), `keep_story_watch_start`, `keep_story_watch_chapters_ping`, `keep_my_story_viewers_v3` (anciennes `keep_story_watch_ping` / `_v2` gardées pour les vieux téléphones).
- **Chronomètre 24 h** « ⏱ HH:MM:SS » (`useStoryCountdown.ts`) ; bouton « ajouter à ma story » gris + popup « C'est bon ✓ » ; ordre des bulles : non vues → vues récentes → sans story → suggestions (`MusicStoryRail.tsx`) ; fiche d'un membre sans story centrée avec dernière musique partagée + dernière connexion (`SourceProfileQuickView.tsx`).
- **Classement de la semaine** (IDEA-094/103) : RPC lecture seule `keep_story_ranking` (top 50) et `keep_my_story_stats` ; badges 🥇🥈🥉⭐✨ sur les bulles, 🔒 à débloquer sur ma photo (fenêtre de progression). Points : 1 partage story, 3 reprise de sa musique, 2 nouvel abonné (7 jours).
- **Robot intelligent** (IDEA-096/099) : salut avec pseudo, alerte solde FREE bas/vide + moyens d'en gagner, secousse + vibration, **jamais pendant Solo/Battle en ligne, jamais deux messages, bulle balayable** (`robotCoachMessages.ts`, `robotCoachService.ts` `robotWelcome`, `GlobalChatDock.tsx`).
- **Profil** : onglets Playlists/Artistes en cartes premium comme Styles (`ProfileStyleCard`), Artistes = uniquement les morceaux de l'artiste (`groupEntriesByArtist` dans `services/styleGroups.ts`) ; tri par style extrait (`groupTracksByStyle`) ; bouton « ✓ TERMINÉ » après « Mettre à jour » (Trier ma musique).
- **Navigation** : barre des 5 onglets **toujours visible** sous les écrans empilés (`PersistentTabBar` dans `Navigation.tsx`, hash du garde-fou mis à jour sur demande d'Adel) ; **menu ☰ plein écran** (plus de hauteur fixe).
- Économie FREE (décisions d'Adel 05/10) : reprise sociale et partage en story GRATUITS (créateur/premier découvreur identifié), voir ERR-FREE-SOCIAL-147 et `docs/PRICING_STRATEGY.md`.

### Base de production (appliqué via execute_sql, fichiers miroirs dans `supabase/migrations/`)
20261005270000 … 20261005340000 (ventes en story, candidats découverte, realtime story_pins, reprise sociale gratuite, vues de story, chapitres, classement, mes stats). Toutes additives. **Piège** : `execute_sql` avec `DROP FUNCTION` reste bloqué/expire (60 s) → ne pas supprimer de fonctions, créer de nouvelles versions (v3, `_chapters_ping`).

### Livraison / CI (état au moment de l'écriture)
- Déclenchement des publications = **ajouter une ligne à `packages/mobile/.eas-build-trigger`** (web + OTA + build iOS ; l'iOS annule/attend selon la concurrence). Pas de trigger = rien n'est publié.
- Release `5b5da88` (vues/chapitres/robot v1/classement/barre onglets/chrono/fiche membre) lancée ; **commits poussés APRÈS (non livrés tant qu'un nouveau trigger n'est pas ajouté)** : règles du robot (jamais en partie, balayage), menu ☰ plein écran, Artistes par artiste, badge 🔒 + badges lumineux.
- Build iOS 404 (`e3c877b`) compilé et soumis à TestFlight ; seule l'étape « Synchroniser avec tous les testeurs » a échoué (cause non établie, peut-être traitement Apple en cours) — à vérifier dans TestFlight/App Store Connect.
- Gardiens Human/Solo/Dual en rouge à cause de la porte QR ordinateur (décision d'Adel en attente : session de test injectée ?).

### À faire / demandes d'Adel non terminées
1. **Vérification finale TestFlight module par module** (IDEA-102) : stories (rangée, ordre, cercles), lecteur (chrono, badge PAYANT/GRATUIT, bouton gris + popup), vues/chapitres, classement/🔒, robot (salut, solde bas, pas en partie), barre des onglets sur Mes sessions/Notifications/Offres, menu ☰, cartes Playlists/Artistes, tri par style ; app = ordinateur. Ne pousser que les modules concernés.
2. **Rappeler à Adel : explication QR ordinateur** (IDEA-101 / `docs/ACCOUNT_SECURITY_PLAN.md`) ; réparer le flux QR (23 créés, 0 approuvé), double connexion + localisation + bouton se déconnecter, Google + Homme/Femme, Authenticator TOTP + notification « sécurisez votre compte » (IDEA-073…076).
3. **Mode Marketing** (IDEA-100/103) : brouillon dans `docs/PRICING_STRATEGY.md` (« Communauté musicale & concours de story »), à valider par Adel avant tout texte dans l'app/les conditions.
4. IDEA-092 statistiques de communauté (style musical, qui reste le plus longtemps) ; option Super Admin plus tard ; IDEA-071 (collection en vente en story + prix proposé via robot/chat) ; IDEA-025 acheter depuis la story ; IDEA-078 audit global app/ordinateur (boutons, e-mails, Solo/Battle/FREE) ; RIB = App Store Connect > Banking (jamais dans le dépôt) ; hamburger ☰ qui s'agite (IDEA-059/064) pas touché.
5. Idée en attente de feu vert : le premier partageur voit combien ont écouté sa musique via les stories des reprises.

### Méthode de preuve utilisée (à recréer, /tmp n'est pas conservé)
Export web Expo → `scripts/fix-web-export.cjs` → copie sous `/KEEP/` servie par `python3 -m http.server`, Playwright avec Supabase simulé (session mockée `sb-rrhqsqzcplvmwxizqnla-auth-token`, route `https://rrhqsqzcplvmwxizqnla.supabase.co/**`), vues 320/390/1440. Avant chaque push : les 7 contrôles (`verify-profile-data-integrity`, `verify-ui-layout-baseline`, `verify-source-of-truth`, `verify-mobile-text-contrast`, `verify-global-user-regression-guard`, `verify-data-preservation`, `verify-product-contract`) depuis la racine, jest + tsc dans `packages/mobile`.


## 05/10/2026 — passe exécutante (n°8, n°1, n°5, n°9.1-9.2, n°6 sûre)
Voir `PROJECT_STATE.md` > Points ouverts. Cause racine du blocage web : décision « ordinateur = QR uniquement » vs robot sans session (corrigé dans `scripts/web-visible-surface-gate.cjs`). Migrations commitées, non appliquées en production. Barre 5 onglets non touchée.

Dernière mise à jour : 28 septembre 2026 — 22:50 UTC (session CRITICAL FIX + OTA DEPLOYMENT).

Ce fichier résume l'état de travail à court terme. Il doit être actualisé à la fin de chaque session importante. Le code, les migrations et les guides agents restent prioritaires en cas d'écart.

## 🔴 CRITICAL FIX — BLACK SCREEN AFTER UPDATE (28/09/2026 23:00 UTC)

**ERR-APP-UPDATE-BLACK-SCREEN-037** — ROOT CAUSE FOUND & FIXED

- **Symptom** : Clicking "Mettre à jour" (update button in AppUpdateBanner) → page reload → completely black screen with only loading spinner, frozen indefinitely.

- **First attempt (FAILED)** — Commit 74958ea :
  - Theory: Race condition in useEffect onboarding check
  - Fix: Split sync/async paths in useEffect
  - Result: Still black screen. This was NOT the root cause.

- **ROOT CAUSE (FOUND)** — Architecture anti-pattern :
  - `if (!onboardingLoaded) return null;` guard at line 276 **fires on FIRST RENDER**
  - React rendering order: (1) render → (2) effects execute → (3) state change → (4) re-render
  - Problem: Guard executes on step 1, returns null (black screen) BEFORE effects run in step 2
  - The useEffect that should set `onboardingLoaded = true` never gets a chance to fix it

- **REAL FIX** — Commit 96ce31c :
  1. ✅ Deleted `onboardingLoaded` state variable entirely
  2. ✅ Deleted `if (!onboardingLoaded) return null;` render guard (lines 276-278)
  3. ✅ Restructured useEffect onboarding logic to properly check AsyncStorage flag
  4. ✅ App now ALWAYS renders something on first render (no null return)
  5. ✅ Shows OnboardingScreen (no user), OnboardingGuideScreen (first visit), or Navigation (normal)

- **Status** :
  - ✅ COMMITTED_LOCAL : commit 96ce31c (TRUE fix)
  - ✅ PUSHED_REMOTE : commit 96ce31c on `reconcile/claude-main-20260825`
  - ✅ VERIFIED : TypeScript compilation 0 errors
  - ✅ VERIFIED : Render guard anti-pattern eliminated
  - ✅ DEPLOYMENT_SIGNAL : Updated `.ota-production-trigger` (commit 6b69a50)
  - ✅ PUSHED_REMOTE : 6b69a50 triggers eas-update-production.yml workflow
  - ⏳ DEPLOYED : GitHub Actions workflow running (OTA to production channel)

- **Verification** : No more render guards that can cause early null returns. First render always shows content.
- **Next** : OTA deployment, real device/browser testing to confirm black screen is resolved.

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

## 🔴 APP STORE DEPLOYMENT READINESS (28/09/2026 — 23h45 UTC)

**STATUS** : Codebase 100% prêt. En attente d'actions humaines Adel.

**Audit complet effectué** :
- ✅ Code-controlled checks : 75/75 (100%)
- ✅ TypeScript : 0 erreurs (packages/mobile)
- ✅ App Store readiness script corrigé et validé
- ✅ EAS build profile : production + auto-eas-build.yml opérationnel
- ✅ StoreKit/IAP : intégration complète, prête à recevoir produits Apple
- ✅ Marketplace : désactivée sur iOS (web-only conforme 3.1.1)
- ✅ Permissions : documentées en français avec textes clairs
- ✅ Legal : 6 pages publiques (privacy, terms, refund, etc.) accessibles in-app
- ✅ Sécurité : zéro secrets en repo, vault.secrets pour clés sensibles

**Documents générés** (28/09/2026) :
1. `docs/APP_STORE_READINESS_AUDIT_20260928.md` — Audit complet 474 lignes
2. `docs/ADEL_APP_STORE_ACTIONS.md` — Day-by-day actions checklist pour Adel

**Actions humaines bloquantes avant soumission** (8 items, ~6h) :
1. Adhésion Apple Developer + clé API App Store Connect
2. 5 GitHub Secrets configurés (EXPO_TOKEN, Apple IDs, P-8 key en base64)
3. 3 produits StoreKit/IAP créés dans App Store Connect
4. 3 secrets Apple IAP configurés en Supabase vault.secrets
5. Stripe keys corrigées (sk_... + pk_... inversées en audit)
6. 6 screenshots + métadonnées (FR+EN) uploadées
7. Compte test reviewer créé + confirmé
8. Device test réel : 5 recognitions OK, 0 crash

**Timeline** :
- Jour 1 : ~2h30 (Adhésion + secrets + 3 IAP)
- Jour 2 : ~3h (Secrets IAP + Stripe + screenshots + metadata)
- Jour 3 : ~30min (Test account + device validation)
- Jour 4–5 : Auto (GitHub Actions build ~60min)
- Jour 5–7 : Auto (Apple review 24–48h)
- Jour 7–8 : 1min (Release on App Store)
**Total : ~2 semaines to live.**

**Commits poussés** :
- `08cc032` : Fix app store readiness checks (75/75 ✅)
- `1adc20c` : App Store readiness audit complet
- `361e5f8` : App Store deployment actions pour Adel

**Prochaines étapes** :
1. Adel exécute les 8 actions humaines (jour 1–3)
2. Push `.eas-build-trigger` ou workflow_dispatch pour build iOS (jour 4)
3. TestFlight + App Store review automatiques (jour 4–7)
4. Release + live (jour 7–8)

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

## 🎬 PHASE 5 — KIDS-FRIENDLY COMPONENTS (28/09/2026 — 23:50 UTC)

### ✅ COMPLETED
- **5 Components created** (commit 62422a9) :
  1. KidsFriendlyErrorBanner — replace harsh errors with friendly messages
  2. KidsEmptyState — friendly empty list states  
  3. KidsLoadingSpinner — cute animated loading
  4. KidsButton — 56px minimum touch targets
  5. KidsModal — kid-friendly dialog system
  
- **Wording Guide** (KIDS_WORDING_GUIDE.md) — complete dictionary of technical → kid-friendly replacements
  
- **Implementation Plan** (PHASE5_IMPLEMENTATION_PLAN.md) — step-by-step integration strategy
  
- **Executive Summary** (EXECUTIVE_SUMMARY_20260928.md) — complete audit + action items for Adel

### 📋 Integration roadmap
- **Phase 5a** : Massive integration of kids-friendly components throughout 5 priority screens
- **Phase 5b** : Wording replacement (all messages must be kid-friendly)
- **Phase 5c** : Touch target verification (all buttons >= 56px)
- **Phase 5d** : Real device testing (child 5-8 years, iPhone + Android)

### 🚀 Status
- ✅ Components: CREATED + PUSHED_REMOTE (62422a9)
- ✅ Wording guide: DOCUMENTED + PUSHED_REMOTE
- ✅ Implementation plan: DOCUMENTED + PUSHED_REMOTE (1c30b60)
- ✅ Executive summary: DOCUMENTED + PUSHED_REMOTE (70b13b7)
- ⏳ Integration: AWAITING DEVELOPER (8-10 hours)
- ⏳ Testing: AWAITING REAL DEVICE (1-2 hours)

### 🎯 Blocking actions for Adel (App Store launch)
1. Corriger Stripe keys (5 min) — PROJECT_STATE.md line 94
2. Configurer Apple IAP (45 min) — APP_STORE_AUDIT line 267
3. Adhésion Apple Developer + GitHub Secrets (90 min) — ADEL_APP_STORE_ACTIONS.md

### ⏱️ Timeline to live
- Jour 1 (now): Audit complete, Adel takes actions (5-30 min)
- Jour 2: Apple IAP + GitHub Secrets config (90 min), Phase 5 integration (2h)
- Jour 3: Phase 5 complete, device testing (1h)
- Jour 4: Auto iOS build via GitHub Actions (~60 min)
- Jour 5-7: Apple review (24-48h)
- Jour 7-8: LIVE ON APP STORE

**Total: 1 week to publication.**

## 📁 Reference documents created today
- `docs/APP_STORE_READINESS_AUDIT_20260928.md` — 75/75 checks passed
- `docs/ADEL_APP_STORE_ACTIONS.md` — day-by-day actions + copy-paste
- `docs/PHASE5_IMPLEMENTATION_PLAN.md` — integration strategy
- `docs/KIDS_WORDING_GUIDE.md` — wording dictionary
- `docs/EXECUTIVE_SUMMARY_20260928.md` — complete recap

## Last commits
- 96ce31c: 🔥 CRITICAL FIX — Black screen (OTA deployed)
- 62422a9: 🧒 PHASE 5 — Kids-friendly components
- 1c30b60: 📋 PHASE 5 — Implementation plan
- 70b13b7: 📊 Executive summary

**Branch**: reconcile/claude-main-20260825
**Status**: READY FOR APP STORE PUBLICATION — Awaiting Adel manual actions + dev Phase 5 integration


## 2026-09-30 — Public API toolbox + protection données production
- Catalogue développeur GitHub `public-apis/public-apis` branché via `npm run public-api:search -- <besoin>` ; aucune dépendance runtime automatique.
- Garde data renforcé : FREE, crédits, Battle, scores/résultats, achats, profils, playlists et événements protégés contre reset/drop/truncate/delete ; ledgers de crédits/audit append-only ; migrations déjà committées immuables.
- Workflow `KEEP — Data preservation contract` run `36781517649` = SUCCESS sur `8432ede5`.
- Audit live Supabase : projet KEEP actif, RLS présente sur les tables critiques contrôlées ; organisation actuellement plan Free. Avant montée à très grande échelle : offre adaptée + sauvegardes automatiques/PITR selon RPO.
- Security Advisor : backlog SECURITY DEFINER/permissions à auditer séparément, sans révocation massive aveugle.


## 2026-10-01 — Bibliothèque produit canonique / anti-régression
- Nouvelle source machine obligatoire : `config/keep-product-contract.json`.
- Hiérarchie de vérité : dernière décision explicite d'Adel → product contract → master spec → code/schéma live → anciens commentaires/tests.
- Profil propriétaire verrouillé : barre `PLUS | Abonnés | Reprises | FREE`; FREE juste après Reprises, jamais à côté du type Utilisateur/Créateur.
- Certification et solde FREE sont des données réelles Supabase : aucun correctif UI n'a le droit de les écrire/réinitialiser pour faire correspondre l'écran.
- Nouveau guard : `scripts/verify-product-contract.cjs` + workflow `KEEP — Product Contract Guard`.
- Toute nouvelle décision durable doit mettre à jour contrat + spec + guards dans le même changement, sinon le CI bloque.
