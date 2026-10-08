# MASTER PLAN — Loki Music (ce qui RESTE à faire)

> Complète `STATE.md` (ce qui est fait). **Règle de travail : plan écrit → validation d'Adel → code.** Une étape à la fois. Aucune IA ne touche `main`, ni au design validé sans accord. Chaque étape finit par : tests + 7 gardes + preuve mobile 390 / ordinateur 1440 + ligne dans `STATE.md`. Audit **ciblé** (seulement le module touché).
> Statuts : ✅ fait · 🟡 partiel · ⛔ pas fait · ❓ cause non établie. Tout ce qui n'est pas vérifié sur iPhone est marqué « non vérifié iPhone ».

## Les 5 missions de gouvernance — état réel au 06/10/2026

### Issue #52 — plan validé par Adel (commentaire PR #53, 08/10/2026)
1. Autoriser les branches de revue `copilot/*` uniquement vers `reconcile/claude-main-20260825`, jamais comme source de publication.
2. Migration additive : pins musique/soirée exclusifs et idempotents ; publication après approbation ; ciblage Pulse goût/pays/devise et statistiques pays.
3. Lecteur story et Pulse partagés mobile/ordinateur : affiche/date/lieu, J'Y VAIS via `event_rsvps`, statistiques organisateur ; Démo sans écriture.
4. Tests SQL isolés, Jest, typecheck/export et navigateur 390/1440 ; revue et CI, sans déployer de migration ni modifier de données réelles.

### Plan validé par Adel — IDEA-189 (06/10/2026)
1. Conserver et vérifier les gardes Stories/Navigation déjà corrigés sur la revue basée sur `0138b4e5`.
2. Étendre `/home/runner/work/KEEP/KEEP/packages/admin/pages/operations.tsx` : version.json canonique, dernière app signalée (pas parc installé), compteurs explicitement bornés ou RPC exact, rapport de preuves lecture seule.
3. Réutiliser `fixed_in_sha` et `/home/runner/work/KEEP/KEEP/docs/ERROR_LEDGER.md` ; distinguer statut corrigé, correctif documenté et livraison prouvée. Migration additive seulement si nécessaire, non appliquée.
4. Agent spécialisé CI : actionlint épinglé avec intégrité, synthèse GitHub par SHA/date/liens et success/skipped/failure distincts ; aucun contrôle global masqué.
5. Tests locaux réels admin, navigateur 390/1440 avec fixtures si nécessaire, contrats existants, actionlint et scan secrets ; journal et mémoire existants, libération du verrou. Tout reste LOCAL_ONLY sans déploiement.

État au 07/10/2026 : implémentation locale réalisée, tests admin/mobile/SQL/Chromium fixtures réussis, règle documentée dans contrat/spec existants. Reste volontairement hors autorisation : commit/push, CI distante des nouveaux fichiers, application de migration et livraison. Actionlint global hérité non vert, version publique inaccessible DNS. Les anciens correctifs sans SHA/test restent à documenter ; aucune attribution automatique ni effacement.

### Mission 1 — Secousse → signalement → réparation → robot
| Élément | Statut | Détail |
|---|---|---|
| Écran exact, appareil, version, build | ✅ | `problemReportService.ts` (non vérifié iPhone) |
| Logs récents | 🟡 | fil des 25 dernières actions/écrans (`reportLoop.ts`) ; pas de logs système |
| **Capture d'écran automatique** | ⛔ | demande `react-native-view-shot` = module natif = **build iOS** |
| Champ de description | ✅ | `ProblemReportHost.tsx` |
| Robot « Reçu, localisé » puis « réparé / mets à jour » | ✅ | `robotSay('REPORT_UPDATE')`, RPC `keep_my_report_updates` ; non vérifié iPhone |
| Agent qui consulte et répare | 🟡 | routine `trig_01CHASzNZx7Yx35UZMmErk8e` (toutes les 6 h) **sans connecteur Supabase ni dépôt** → Adel doit les ajouter dans claude.ai > Routines |
| Délai de réparation borné | ⛔ | à définir : proposition = accusé < 1 min, tri < 6 h, correctif JS < 24 h |
**Plan (à valider)** : (a) Adel ajoute connecteur + dépôt à la routine ; (b) test à blanc avec un faux signalement ; (c) build iOS unique qui regroupe view-shot + sons de notification (évite 2 builds).

### Mission 2 — Modération et sécurité
| Élément | Statut | Détail |
|---|---|---|
| Insultes bloquées (signalements) | ✅ | `isAbusiveReport` ; message non stocké, ligne « signalé » |
| Insultes dans le **chat / commentaires** | ⛔ | à vérifier module par module (audit ciblé) |
| Blocage d'un utilisateur signalé | 🟡 | `user_blocks` (utilisateur→utilisateur) existe ; **aucun bannissement de compte** |
| **Bannissement par adresse IP** | ⛔ | l'IP n'est pas visible côté application : il faut une fonction serveur qui la lit, une table de bannissement, un contrôle à la connexion |
| Blocage dans le Super Admin | ⛔ | liste des signalements + bouton bloquer / lever |
**Réserve à trancher avec Adel avant de coder** : une IP peut être partagée (wifi, 4G, famille) → risque de bloquer des innocents ; proposition : bannissement **compte + appareil** d'abord, **IP temporaire (24 h – 7 j)** ensuite, toujours levable depuis le Super Admin, jamais automatique.

### Mission 3 — Visiteur non inscrit (lien partagé)
| Élément | Statut | Détail |
|---|---|---|
| Robot d'invitation avec le nom de l'invitant | ✅ | `VisitorInviteRobot` (non vérifié iPhone) |
| Voir la story, swiper, écouter sans compte | ❓ | à auditer en conditions réelles de visiteur : les stories sont limitées aux « comptes réels avec e-mail vérifié » côté lecture ; vérifier ce qu'un visiteur voit vraiment |
| « Je trie ta musique dans tes plateformes » | ⛔ | message prêt, fonction de rangement par plateforme non liée |
**Plan** : audit ciblé du parcours visiteur (RLS + écrans) → liste de ce qui est ouvert/fermé → proposition d'« avant-goût » (X morceaux écoutables puis invitation).

### Mission 4 — Profil musical et recommandations
| Élément | Statut | Détail |
|---|---|---|
| Profil de goût (GARDER, ❤, 😐, 👎, partages) | ✅ | `keep_my_taste_profile` |
| Recommandations de musiques en tête de Loki Pulse | ✅ | `keep_recommend_for_me` |
| Compléter le style (questionnaire + signaux) | ✅ | questionnaire obligatoire à l'inscription (`TasteOnboardingGate`, 06/10) : genre + styles pré-cochés ; langue/pays détectés |
| **Utilisateurs au même style** | ⛔ | RPC de proximité de goût + affichage |
| Partage payant dans Loki Pulse (IDEA-130) | ⛔ | règles à valider (voir ci-dessous) |

### Mission 5 — Bugs critiques de l'audit du 06/10
| Bug | Statut | Reste |
|---|---|---|
| Son iPhone `PREVIEW_PLAY_FAILED` | ❓ | cause non reproduite ; diagnostic enrichi (`err=`) en place → attendre le prochain échec, corriger sur preuve. Investiguer aussi « son tardif dans la story » (IDEA-133) |
| Achats Apple (`appAppleId`) | 🟡 | source corrigée dans `keep-iap-verify` et `keep-apple-notifications` ; **non déployée** (accord d'Adel). RIB Apple pas encore saisi → on reste en TestFlight |
| `keep_event_playlist` | ✅ | créée en base, appel testé |
| QR ordinateur | ⛔ | 185 demandes / 0 approbation : tracer scan → approbation → connexion sur un vrai iPhone |
| Push APNs / sans appareil | 🟡 | audit fait. Causes : permission iOS refusée (20 refus), 1 seul token, Android sans FCM, FREE_CREDITED en « in-app seulement », sons = build natif |
| Super Admin « payants actifs » | ⛔ | exclure formules offertes et transactions Sandbox |
| E-mails | ❓ | test du 06/10 00:48 non reçu ; vérifier clés Brevo, file `email_queue`, webhook ; journaux d'envoi illisibles depuis cette session → à demander à Adel (capture du tableau Brevo) ou accès aux logs |
| Défi « Réagir à 20 » | ✅ | corrigé |

## Nouveaux points du 06/10/2026 (soir)
- **PASSER dans une session** : retire désormais la musique de la liste (récupérable dans « RETIRÉS ») — ✅ code, non vérifié iPhone. *Révise la règle du 02/10 : à confirmer par Adel.*
- **Étape B2 — mise en story d'une musique en vente / achetée (décision requise)** : aujourd'hui refusée (protection du vendeur). Proposition : l'autoriser **masquée** (carte « Musique en vente · de @vendeur », titre caché, lien vers la boutique) = publicité gratuite pour le vendeur, sans fuite du titre. Demande une règle serveur (`keep_pin_shared_story_track`) + l'affichage « de @vendeur » dans les stories d'autrui. Anti-doublon : annoncer « elle est déjà en story » aussi pour les musiques d'une collection achetée.
- ✅ **Mise en story gratuite sans GARDER (musique sans propriétaire)** : livrée le 06/10 (RPC `keep_pin_free_story_track`). Reste B2 (musique EN VENTE en story masquée).
- **Performance du profil** : 111 → 94 requêtes ; reste à unifier `keep_decisions` ×7, `playlists` ×4, `follows` ×5, `notifications` ×3.
- **IDEA-144 — musique libre sans propriétaire** (partie « prends-la vite » : badge fait ; message de l'agent à écrire) : marquer « Gratuit · non certifié » et faire dire à l'agent « prends-la vite, identifie-la sur ton profil, tu seras le premier » ; règle à cadrer (qui est « propriétaire » ? comment prouver la découverte ?).

## Nouveaux chantiers du 06/10/2026 (nuit) — à valider avant code
- **Catalogue « toujours trouver » + plateformes** : voir `docs/CATALOGUE_ET_PLATEFORMES.md` (faisabilité, plateforme par plateforme). Étape F proposée : recherche en cascade + catalogue qui grandit seul + « Ajouter par lien » + « Demander ce titre » ; likes YouTube / Spotify / Deezer / Apple remontés ; TikTok / Instagram = Partager → Loki seulement.
- **Latence du Swipe** : instrumentée (`SWIPE_SLOW` envoyé au journal si le son met > 2,5 s) ; correction sur preuve réelle ; pistes : préchargement de 2 titres d'avance, extraits résolus et gardés côté serveur par ISRC.
- **Super Admin budget / frais / jalon 15 000 abonnés** : `costs.tsx` + `operating_costs` existent mais vides ; plan en 4 points dans le doc ci-dessus.

## Règles de design à intégrer (accord d'Adel déjà donné — implémentation après validation du plan)
- IDEA-131 : pastilles ❤ 😐 👎 de ma story **alignées à droite sur le bord (comme ☰ / ✕)**, même taille, mêmes espaces.
- IDEA-132 : boutons fréquents toujours au-dessus ; « ÉCOUTER SUR APPLE MUSIC » descend sous PASSER / ARRÊTER / GARDER.
- IDEA-128/135 : menu ☰ sans redirection inutile ; QR PayPal : recadrer la photo **existante**.
- Parité : le design ordinateur est jugé parfait ; l'écart vient de TestFlight (version 407 / SHA `dcc4899` : attendre le build du SHA courant).

## Chantier produit à cadrer (IDEA-130 — Partage dans Loki Pulse)
Questions à valider avant toute ligne de code : prix en FREE par partage ; quota par jour pour non-certifié / certifié ; « 5-10 % de visibilité » = part maximale d'un même utilisateur dans le fil ; reversement « 3 FREE » = à qui, quand, pour quel achat ; statistiques affichées (gemmes) ; écriture dans les offres et `docs/PRICING_STRATEGY.md`.

## Cahier de tests (système anti-oubli) — à produire après validation
Une checklist unique `docs/TEST_PLAN.md` : parcours utilisateur (inscription → écoute → GARDER → story → réaction → partage), parcours visiteur, parcours Super Admin (signalements, blocage, prix, statistiques), parcours AQUA du paiement, notifications app fermée (iPhone, Samsung), QR ordinateur. Chaque ligne : mobile 390 / ordinateur 1440 / TestFlight, preuve, date. Jamais « validé » sans preuve.

## Ordre proposé (une étape = une validation)
1. **Étape A — sans risque** : Adel ajoute connecteur + dépôt à la routine ; je déploie les 2 fonctions Apple (si « OK ») ; correction du Super Admin (payants actifs).
2. **Étape B — design validé** : alignement des pastilles + hiérarchie des boutons dans la story.
3. **Étape C — diagnostic** : parcours visiteur ; son tardif de la story ; QR ordinateur (trace réelle) ; e-mails.
4. **Étape D — build iOS unique** : capture d'écran de secousse + sons de notification (pièces, débit) + permission notifications guidée (« Ouvrir les réglages »).
5. **Étape E — sécurité** : bannissement compte/appareil/IP temporaire + écran Super Admin.
6. **Étape F — produit** : partage payant dans Loki Pulse, utilisateurs au même style, offres DJ + accès ordinateur.

## Plan ordonné du 06/10/2026 (relais navigateur) — à valider par Adel avant code (sauf P1, faite)
1. **P1 Écran Offres compact** — FAIT (ERR-OFFERS-COMPACT-198).
2. **Bugs prouvés avant soumission Apple** : (a) son iPhone `audioPreviewService.ensurePlaying()` n'attend que 90 ms puis exige `isPlaying` alors que le flux est en `isBuffering` → attendre le buffering (borné) ; (b) `STORY_PIN_FAILED` uuid `trk_…` (`MusicSwipeDeckModal.tsx`) → ne pas envoyer d'id non-UUID ; (c) « déjà vu » des stories côté serveur (`story_views`/`story_watch_sessions`) + audit des autres états locaux ; (d) e-mails : expéditeur Brevo à valider (Adel) ; (e) `music_recognition_attempts` vide depuis 14 jours ; (f) Super Admin : exclure `admin_grant` des « payants ».
3. **IDEA-168 Règle abonnement** (expiration → FREE, trace datée, relance, délai de grâce) + déploiement des 2 fonctions Apple.
4. **IDEA-167 Annonce « disponible »** (jamais avant approbation, activable Super Admin).
5. IDEA-161 (trouver le morceau), 162 (plateformes), 163 (traduction gratuite), 164 (robot d'aide), 165 (13+), 166 (retour profil).

### Ajout du 06/10/2026 (relais) — à valider par Adel avant code
- **J (IDEA-169)** vérification d'e-mail pour tous : réutiliser `AccountEmailPanel` / `keep-account-email` ; pop-up au démarrage (mobile + PC), envoi auto du code, « Plus tard » ; Super Admin « Relancer les non vérifiés ».
- **K (IDEA-170)** Super Admin Clés & intégrations : une carte par service.
- **L (IDEA-171)** clés manquantes + pistes gratuites. **M (IDEA-172)** SPF/DKIM/DMARC.
- **Constat règle I (IDEA-168)** : `keep-apple-notifications` écrit déjà `EXPIRED`/`CANCELLED` et `loadCurrentPlanCode` ignore les abonnements non ACTIVE/TRIALING → retour FREE automatique côté lecture ; MANQUE : trace datée `subscription_history`, délai de grâce (`GRACE_PERIOD`), relance « reviens », et distinction annulation (reste actif jusqu'à la fin) vs expiration.

## Plan Super Admin « niveau Apple » (06/10/2026) — À VALIDER PAR ADEL AVANT CODE
Ordre proposé, une étape = une preuve 390/1440, rien supprimé, aucun doublon :
1. **Audit lecture seule** (R) : rapport page par page du Super Admin (marche / vide / doublons / textes > 5 mots) → `docs/SUPERADMIN_AUDIT.md`.
2. **Menu 8 rubriques** (N, IDEA-173) : regroupement des 18 entrées existantes (mêmes écrans, aucune réécriture), une seule entrée Sécurité, état vide « Rien à approuver » + historique.
3. **Fiche utilisateur** : vérification e-mail + « Relancer les non vérifiés » (lié à IDEA-169), signalements « secousse » dans Modération.
4. **Mots de passe testeurs** (P, IDEA-175) : migration chiffrée (pgcrypto, clé hors base), lecture SUPER_ADMIN via RPC auditée, expiration 30 j, « Effacer » = effacement de la copie seulement. ⚠ Décision d'Adel notée : un mot de passe réversible est un risque ; garde-fous proposés : comptes TESTEURS uniquement (jamais les vrais utilisateurs), journal de chaque lecture, purge automatique à 30 j.
5. **Zéro clavier + cartes** (O, Q) : Clés & intégrations en une carte par service, Copier/Coller.
6. **Règle > 5 mots** (S, IDEA-178) : composant commun de repli + garde CI en mode *avertissement* d'abord (liste des écrans), puis blocage écran par écran ; ne jamais casser le design validé. Conflit à trancher : l'écran Offres est à ~23 mots (IDEA-160) ; la règle 5 mots le remplacerait.
