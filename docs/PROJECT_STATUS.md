# KEEP — Statut du projet

Dernière mise à jour : 2026-08-21, session cloud (voir note environnement
ci-dessous). Statuts honnêtes uniquement — `PRODUCTION_READY` n'est utilisé
que pour ce qui a réellement tourné en conditions réelles.

Légende : `PLANNED` · `CODED` · `CONNECTED` · `TESTED` · `PRODUCTION_READY` ·
`MOCK` · `BLOCKED`

## ⚠️ Contrainte d'environnement (lue avant tout le reste)

Cette session de développement tourne dans un environnement cloud dont
l'accès réseau sortant est restreint aux domaines déjà autorisés
(github.com pour git). **`npm install` et `pip install` de nouveaux paquets
sont bloqués** (`registry.npmjs.org` et `pypi.org` renvoient
`host_not_allowed`), malgré la documentation générale de l'environnement qui
annonce un accès aux registres standards. Conséquence directe :

- Aucune dépendance npm n'a pu être installée ici (pas de `node_modules`).
- Impossible de lancer `expo start --tunnel` depuis cette session cloud —
  **le Milestone 1 ("KEEP visible sur ton iPhone") n'a pas pu être vérifié
  en direct depuis ici.**
- Le code de `packages/music` (zéro dépendance externe) a pu être **exécuté
  réellement** malgré tout via l'outil `tsx` déjà présent globalement dans
  le sandbox — voir section TESTED ci-dessous, ce sont de vrais résultats
  d'exécution, pas des affirmations non vérifiées.
- Le code mobile (React Native/Expo) n'a en revanche PAS pu être exécuté
  ni affiché — impossible de garantir qu'il compile sans erreur tant qu'un
  `npm install` n'a pas eu lieu quelque part.

**Deux façons de lever ce blocage** (voir ACTION UTILISATEUR REQUISE) :
élargir l'accès réseau de cette session (Admin settings → Capabilities),
ou exécuter `npm install && npx expo start --tunnel` sur ta machine (2
commandes, ~2 minutes).

## PRODUCTION_READY

- Rien à ce stade. Aucune fonctionnalité n'a été exécutée en conditions
  réelles (vrai appareil, vrai provider, vrai paiement) — conforme à la
  règle "ne jamais dire validé sans test réel".

## TESTED (exécuté réellement, résultats vérifiés)

- `packages/music` — `TrackResolver`, `SmartPlaylistRouter`, `LibraryAnalyzer`,
  `MusicDNA` : **15/15 vérifications exécutées avec succès** via
  `npx tsx packages/music/scripts/verify.ts` (voir sortie dans l'historique
  de session). Couvre : résolution ISRC/fuzzy, non-fusion abusive,
  déduplication, apprentissage par correction, personnalisation par
  utilisateur, détection de doublons cross-playlist, calcul d'ADN musical.
- `AppleMusicProvider` (implémentation réelle du `MusicProviderAdapter`
  pour Apple Music) : **14/14 vérifications exécutées avec succès** via
  `npx tsx packages/music/scripts/verify-apple-music.ts`, avec un fetch
  simulé reproduisant fidèlement les réponses documentées par Apple
  (pagination, authentification à deux jetons, ISRC absent/présent,
  erreurs). Statut TESTED-mock, jamais appelé contre le vrai serveur Apple
  (nécessite un compte Apple Developer + un developer token réel).
- Signature JWT ES256 du developer token Apple Music
  (`packages/backend/src/lib/appleDeveloperToken.ts`) : **10/10
  vérifications exécutées avec succès** via
  `npx tsx packages/backend/scripts/verify-apple-developer-token.ts`,
  incluant une **vérification cryptographique réelle** de la signature
  (génération d'une vraie paire de clés EC P-256, signature, puis
  `crypto.verify` avec la clé publique correspondante — pas une simple
  inspection de forme).
- Génération HTML + parsing des messages du flux d'autorisation Apple
  Music (`appleMusicAuthHtml.ts`) : **7/7 vérifications exécutées avec
  succès** via `npx tsx packages/mobile/scripts/verify-apple-music-auth.ts`.
- `AudDRecognitionProvider` (implémentation réelle de
  `MusicRecognitionProvider` pour AudD) : **13/13 vérifications exécutées
  avec succès** via `npx tsx packages/music/scripts/verify-audd.ts`,
  incluant la construction réelle de la requête multipart (pas seulement
  le traitement de la réponse). Statut TESTED-mock, jamais appelé contre
  le vrai serveur AudD (nécessite une clé API réelle).
- Agrégats + recherche/filtre Super Admin (`packages/admin/lib/aggregate.ts`) :
  **16/16 vérifications exécutées avec succès** via
  `npx tsx packages/admin/scripts/verify.ts` — persiste enfin dans le
  dépôt une vérification qui n'existait auparavant que de façon ad-hoc
  (perdue entre les sessions). Inclut une vérification de cohérence entre
  les clés de `DEMO_FEATURE_FLAGS` et le seed SQL réel
  (`0007_seed_defaults.sql`), pour éviter toute divergence future.
- **Les 7 migrations SQL appliquées pour de vrai contre un vrai PostgreSQL
  16** (`bash supabase/scripts/verify-migrations.sh`, testé dans cette
  session ET ajouté en CI `.github/workflows/verify-migrations.yml`, sans
  secret nécessaire). Ce n'est pas Supabase managé (pas de test contre le
  vrai service Supabase), mais un test réel et automatisé du même moteur
  PostgreSQL avec un schéma `auth` shim reproduisant le contrat Supabase
  Auth. Assertions métier vérifiées, pas seulement "ça s'applique sans
  erreur" :
  - trigger `sync_is_adult` : 20 ans → `is_adult=true`, 10 ans → `false`.
  - trigger `check_subscription_currency` : accepte EUR/EUR, **rejette
    réellement** un abonnement AED sur un prix EUR (message d'erreur du
    trigger vérifié mot pour mot).
  - RLS testée avec un rôle non-superuser réel (`app_user`, sans
    `BYPASSRLS` — sans ça le test ne prouverait rien, le propriétaire des
    tables contourne toujours RLS) : Alice voit son propre profil, Alice
    ne voit **0 ligne** de `profile_private_info` de Bob, et `admin_users`
    reste invisible même avec une vraie ligne dedans.
- Des tests Jest équivalents existent aussi dans `src/__tests__/*.test.ts`
  (format standard pour CI future) mais **Jest lui-même n'a pas pu être
  installé** dans ce sandbox — non exécutés via Jest, seulement via `tsx`.
- Parité des traductions FR/EN (`packages/mobile/src/i18n/__tests__/parity.test.ts`) :
  vérifiée manuellement (relecture ligne à ligne des deux fichiers JSON),
  pas encore exécutée automatiquement (même blocage npm).

## CONNECTED (câblé de bout en bout, non vérifié en exécution)

- Pipeline GARDER mobile : `HomeScreen` → `usePlayerStore` →
  `musicEngine.recognitionProvider` → `TrackResolver` →
  `SmartPlaylistRouter` → `musicEngine.musicProvider.addTrackToPlaylist`
  → `usePlaylistStore.refresh()`. Le code existe et s'enchaîne
  logiquement (mêmes classes que celles testées ci-dessus), mais n'a
  jamais tourné dans un vrai Metro/Expo.
- `MyMusicScreen` → "Ranger ma musique" → `analyzeLibrary` (testé isolément,
  non vérifié depuis l'écran).
- Base de données : migrations SQL complètes et cohérentes (RLS incluse)
  mais **jamais appliquées à un vrai projet Supabase** — aucun projet
  Supabase n'existe encore pour KEEP.

## CODED (écrit, non branché à un provider réel)

- `MusicProviderAdapter` (interface) — implémentation Apple Music réelle
  écrite et testée en isolation (voir TESTED ci-dessus), pas encore
  branchée dans `musicEngine` (le backend qui délivre le developer token
  n'est pas déployé, et le flux WebView n'a jamais tourné sur un vrai
  appareil) ; aucune implémentation Spotify réelle encore écrite,
  seulement `DemoMusicProvider`.
- `AppleMusicAuthScreen` (WebView MusicKit JS) + `appleMusicAuth.ts`
  (stockage sécurisé du Music User Token via expo-secure-store) — écrits,
  jamais exécutés sur un vrai appareil.
- `GET /api/music/apple/developer-token` (backend) — signe un vrai JWT
  ES256 quand les variables d'env MusicKit sont présentes, répond
  honnêtement 501 sinon. Pas encore protégé par une authentification KEEP
  (voir avertissement de sécurité dans `routes/music.ts`) — À CORRIGER
  avant tout déploiement public.
- `MusicRecognitionProvider` (interface) — implémentation AudD réelle
  écrite et testée en isolation (voir TESTED ci-dessus), pas encore
  branchée dans `musicEngine` (nécessite une vraie clé API AudD, ACTION
  UTILISATEUR) ; aucune implémentation ACRCloud (solution de secours)
  encore écrite, seulement `DemoRecognitionProvider`.
- Backend Express (`packages/backend`) : uniquement un health-check, aucune
  route métier.
- Super Admin Next.js (`packages/admin`) : Dashboard, Utilisateurs,
  Abonnements & Prix, Coûts & Rentabilité, Feature Flags construits et
  testés (voir TESTED) ; Paiements, Analytics produit avancé, Logs
  (audit_logs), Rôles/RBAC et authentification réelle restent à faire —
  voir l'avertissement permanent affiché dans l'interface elle-même
  (`AdminLayout.tsx`) tant que l'auth n'est pas branchée.
- Onboarding (Apple/Google/Email) : les boutons existent et réagissent
  honnêtement ("backend pas encore connecté"), aucune authentification
  réelle.
- Pipeline CI/CD iOS (`.github/workflows/eas-build-ios.yml` + `eas.json`) :
  écrit et cohérent avec la doc officielle EAS Build (vérifié via
  recherche web le 21/08/2026, pas juste supposé), jamais exécuté — dépend
  de 3 actions propriétaire (compte Expo, compte Apple Developer, fiche
  App Store Connect) et du déblocage du push GitHub. Voir
  `docs/DEPLOYMENT_TESTFLIGHT.md`.
- Assets app store (`packages/mobile/assets/icon.png`, `adaptive-icon.png`,
  `splash.png`, `favicon.png`) : générés programmatiquement (ImageMagick,
  couleurs de marque KEEP), remplacent les fichiers manquants référencés
  par `app.json` mais jamais présents. Non validés par un humain — à
  revoir avant soumission réelle si un vrai logo designé existe par
  ailleurs.

## MOCK (Mode Démo assumé, jamais présenté comme réel)

- `DemoMusicProvider`, `DemoRecognitionProvider` : catalogue et playlists
  fictifs en mémoire, réinitialisés au relancement — badge "🎭 MODE DÉMO"
  visible sur chaque écran concerné.
- Utilisateur démo (`useUserStore.enterDemoMode`) — n'écrit jamais en base
  (il n'y a d'ailleurs pas encore de base connectée).

## BLOCKED

| Élément | Raison | Débloqué par |
|---|---|---|
| Push GitHub (`adelkhatra-bit/keep`) | Le proxy git de cette session refuse le push : *"adelkhatra-bit/keep is not in this session's authorized repository set"* — dépôt non autorisé, indépendamment du token GitHub déjà connecté en lecture. | Autoriser ce dépôt pour la session (paramètres Cowork/Claude, pas un token à coller). |
| `npm install` / tests Jest / Expo tunnel | Accès réseau sortant restreint dans ce sandbox cloud (voir section environnement). | Élargir l'accès réseau (Admin → Capabilities) OU exécuter en local sur ta machine. |
| Déploiement Supabase managé (le schéma lui-même est maintenant vérifié contre un vrai PostgreSQL 16, voir TESTED) | Aucun projet Supabase KEEP n'existe. Connecteur Supabase disponible dans le registre mais non installé pour cette organisation. | Connecter le connecteur Supabase (méthode sécurisée, pas de clé à coller ici), ou créer le projet et transmettre l'URL. |
| Reconnaissance musicale réelle (AudD) | Aucune clé API AudD. | Créer un compte AudD (free tier 300 requêtes sans CB) et fournir la clé via une méthode sécurisée. |
| Spotify Extended Quota (>5 comptes) | Nécessite 250k MAU + entité légale (voir PLATFORM_COMPLIANCE.md) — non actionnable maintenant. | Décision produit : Apple Music comme provider principal du lancement. |
| Apple Developer / Google Play accounts | Nécessite identité, paiement, 2FA personnels. | Voir ACTION UTILISATEUR REQUISE ci-dessous. |

## Corrections de fond effectuées (bug bloquant pour tout le monde, pas juste TestFlight)

- `packages/mobile/package.json` déclarait `react-navigation`,
  `react-navigation-bottom-tabs`, `react-navigation-native` — **ces noms de
  package n'existent pas sur npm** (les vrais paquets React Navigation v6
  sont scopés : `@react-navigation/native`, `@react-navigation/bottom-tabs`,
  déjà ceux réellement importés dans `Navigation.tsx`). N'importe quel
  `npm install`/`npm ci` — y compris celui du pipeline CI EAS Build tout
  juste écrit — aurait donc échoué dès l'installation des dépendances.
  Corrigé : remplacés par les vrais paquets scopés aux bonnes versions
  (compatibles React Navigation v6 / Expo SDK 51). Cause racine corrigée,
  pas seulement contournée — root cause: erreur de nommage de package,
  jamais détectée faute d'avoir pu lancer `npm install` dans ce sandbox
  jusqu'à cette relecture ligne à ligne du package.json.

## Sécurité — corrections effectuées

- `packages/mobile/.env` et `.env.local` étaient suivis par git malgré leur
  présence dans `.gitignore` (le gitignore ne peut pas "détracker"
  rétroactivement). Aucun vrai secret n'était présent (valeurs Mode Démo
  uniquement) — retirés du suivi git par précaution avant qu'un vrai secret
  n'y soit un jour ajouté par erreur. Commit local `81af63a`.

## ACTION UTILISATEUR REQUISE

**1. Accès push GitHub**
Service : GitHub (dépôt `adelkhatra-bit/keep`)
Pourquoi : le proxy git de cette session bloque le push tant que le dépôt
n'est pas explicitement autorisé — c'est la méthode sécurisée que tu as
demandée (pas de token à coller).
Action exacte : autoriser `adelkhatra-bit/keep` dans les paramètres de
connexion GitHub de cette session/organisation Cowork.
Temps estimé : 1-2 minutes.
Ce que je reprendrai ensuite : push immédiat de tous les commits locaux
déjà prêts, puis push automatique à chaque étape suivante.

**2. Accès réseau du sandbox (npm/pip)**
Service : Admin settings → Capabilities (mentionné dans la documentation
produit Claude/Cowork)
Pourquoi : sans ça, je ne peux ni installer les dépendances, ni exécuter
Jest/ESLint/TypeScript check complet, ni lancer `expo start --tunnel` pour
que tu voies KEEP en direct sur ton iPhone depuis cette session.
Action exacte : élargir l'accès réseau sortant de cette session (registres
npm/pip), OU — alternative sans réglage à changer — ouvrir un terminal sur
ta machine dans le dossier du repo et lancer `npm install && npx expo start
--tunnel`, puis scanner le QR avec Expo Go.
Temps estimé : 2 minutes (option locale) ou variable (option réglage admin).
Ce que je reprendrai ensuite : dès que l'un des deux est fait, j'exécute
réellement tous les tests, je type-check tout le monorepo, et je confirme
le Milestone 1.

**3. Connecteur Supabase**
Service : connecteur Supabase (déjà visible dans le registre de connecteurs,
non installé pour cette organisation)
Pourquoi : aucun projet Supabase KEEP n'existe ; le schéma est prêt
(`supabase/migrations/`) mais rien n'est déployé.
Action exacte : connecter le connecteur Supabase depuis claude.ai (méthode
sécurisée), ou créer le projet toi-même et m'indiquer son URL.
Temps estimé : 3-5 minutes.

**4. Compte AudD (reconnaissance musicale)**
Service : audd.io
Pourquoi : nécessaire pour sortir la reconnaissance musicale du Mode Démo.
Action exacte : créer un compte (free tier 300 requêtes, sans CB), fournir
la clé API par une méthode sécurisée (pas collée en clair ici).
Temps estimé : 5 minutes.

**5. Pipeline TestFlight (3 sous-actions détaillées)**
Service : Expo / Apple Developer / App Store Connect
Pourquoi : identité, paiement et 2FA personnels — je ne peux légalement pas
le faire à ta place. Le pipeline CI/CD qui automatisera tout le reste
(build + soumission TestFlight à chaque push) est déjà écrit et prêt.
Action exacte : voir `docs/DEPLOYMENT_TESTFLIGHT.md` — 3 actions dans
l'ordre (compte Expo + token, compte Apple Developer + clé API ASC, fiche
App Store Connect), chacune avec son lien exact et les secrets GitHub à
renseigner (jamais collés ici).
Temps estimé : 15-20 min de ta part, + 24-48h d'attente de validation
Apple entre les étapes 2 et 3.
