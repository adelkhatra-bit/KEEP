# KEEP — Statut du projet

Dernière mise à jour : 2026-08-21, session locale (machine d'Adel — voir
"Session locale du 21/08/2026" ci-dessous, qui lève la contrainte réseau
décrite dans la note "session cloud" juste en dessous ; cette note cloud est
gardée pour l'historique). Statuts honnêtes uniquement —
`PRODUCTION_READY` n'est utilisé que pour ce qui a réellement tourné en
conditions réelles.

Légende : `PLANNED` · `CODED` · `CONNECTED` · `TESTED` · `PRODUCTION_READY` ·
`MOCK` · `BLOCKED`

## Session locale du 21/08/2026 — correction de concept + déblocage réseau

Cette session tourne en local sur la machine d'Adel, **pas** dans le sandbox
cloud contraint décrit ci-dessous — `npm install`/`npx expo` fonctionnent
réellement ici. Deux volets :

**1. Correction de concept (retour utilisateur direct) :** l'onglet
"Écouter" donnait l'impression que KEEP est un lecteur de musique. Corrigé
en un vrai moteur de **session** : `useSessionStore` (reconnaissance
enchaînée à intervalle régulier, détection de fin de session par silence
prolongé — durée configurable, défaut 10 min), `useSessionHistoryStore`
(historique persistant AsyncStorage — "Mes Sessions"), nouveaux écrans
`HomeScreen` (session live, animation `SessionPulse` en SVG/Reanimated à la
place de l'ancienne pochette 260×260), `SessionRecapScreen` (GARDER
TOUT/sélection/RANGER), `SessionHistoryScreen`. `ProfileScreen` et
`DiscoverScreen` largement refaits (voir sections TESTED/CODED plus bas).
Voir `docs/PLATFORM_COMPLIANCE.md` §8 pour la recherche sourcée sur les
contraintes réelles micro/arrière-plan iOS/Android qui bornent ce que le
moteur de session a le droit de faire (décision : premier plan pour cette
itération, arrière-plan total = chantier séparé, pas déclaré dans
`app.json` tant qu'il n'est pas câblé).

**2. Le réseau n'est PAS bloqué ici** (contrairement au sandbox cloud) :
`npm install` a réellement tourné (1425+ paquets), ce qui a révélé et permis
de corriger plusieurs bugs bloquants jamais détectés faute d'avoir pu
installer avant :
- `expo-audio@~13.1.0` dans `packages/mobile/package.json` : version qui
  n'a **jamais existé** sur npm (plus bas que la première version publiée),
  et le paquet n'était importé nulle part dans le code — supprimé (doublon
  mort avec `expo-av`, déjà réellement utilisé).
- `expo-image-picker` référencé comme plugin dans `app.json` mais absent de
  `package.json` — `npx expo install` ne pouvait même pas vérifier la
  config. Ajouté à la bonne version SDK 51.
- `tsconfig.json` : `resolveJsonModule: true` incompatible avec
  `moduleResolution` implicite `classic` (faute de `moduleResolution`
  explicite) — `tsc --noEmit` n'avait **jamais pu tourner jusqu'au bout**
  avant cette session. Corrigé (`moduleResolution: "bundler"`) : le
  type-check tourne maintenant réellement et est **propre (0 erreur)** sur
  tout `packages/mobile`, y compris tout le code ajouté cette session.
- `package.json` racine `"main": "node_modules/expo/AppEntry.js"` : chemin
  littéral qui ne résout plus une fois `expo` hissé à la racine du monorepo
  par npm workspaces (`ConfigError: Cannot resolve entry file`) — bloquait
  `expo start`/`expo export` avant même Metro. Remplacé par le point
  d'entrée standard moderne (`index.js` + `registerRootComponent`),
  recommandé par Expo pour les monorepos.
- Ajout d'`expo-location` (SDK 51, via `npx expo install`) pour la
  localisation approximative opt-in (profil + Découvrir), et
  `react-native-svg`/`react-native-qrcode-svg`/`@react-navigation/native-stack`
  pour l'animation de session, le QR profil et la navigation vers le récap.

**Vérifications réelles effectuées cette session (pas des affirmations) :**
- `npx tsc --noEmit` sur `packages/mobile` : **0 erreur** (jamais exécutable
  avant, voir bug tsconfig ci-dessus).
- `npx jest` sur `packages/mobile` : **2/2 tests passés**, y compris la
  parité i18n FR/EN après ajout de toutes les nouvelles clés
  (session/history/profile/discover) — jamais exécutable avant (Jest non
  installable dans le sandbox cloud).
- `npx tsc --noEmit` sur `packages/admin` : **0 erreur** après l'ajout du
  panneau "Réglages session" (durée de fin de session configurable).
- `npx tsx packages/admin/scripts/verify.ts` : **16/16** (inchangé, la
  cohérence des feature flags avec le seed SQL n'a pas été touchée).
- `npx tsx packages/music/scripts/verify.ts` : **15/15** (moteur musical
  non modifié, ré-exécuté par précaution).
- **`npx expo export --platform ios` : bundle Metro réel réussi — 1278
  modules, tout le code (nouveaux écrans/stores/composants inclus) compile
  et se bundle de bout en bout pour iOS.** C'est la première fois que le
  code mobile de KEEP est réellement bundlé/exécutable par Metro — avant
  cette session, `PROJECT_STATUS.md` disait explicitement "impossible de
  garantir qu'il compile sans erreur tant qu'un `npm install` n'a pas eu
  lieu quelque part". Fait, ici.

**Ce que ça change pour le Milestone 1** ("KEEP visible sur ton iPhone") :
le blocage réseau qui l'empêchait est levé sur cette machine. Reste
seulement `npx expo start --tunnel` + scanner le QR avec Expo Go — voir en
bas de ce document pour le lien lancé pendant cette session.

## Session locale du 22/08/2026 — bug critique trouvé en testant réellement

Pour vérifier réellement l'app (pas juste `tsc`/`jest`, qui ne détectent pas
les crashs à l'exécution), `react-native-web` a été ajouté temporairement
comme harnais de test (`expo start --web`), avec les stores exposés sur
`window` en `__DEV__` uniquement pour naviguer sans dépendre d'`Alert.alert`
(non implémenté par react-native-web).

**Trouvé : crash total au montage de la navigation** ("Invalid hook call" /
"Cannot read properties of null (reading 'useEffect')"). Cause réelle :
**deux copies de React installées** dans le monorepo npm workspaces —
`packages/admin` autorisait `^18.2.0` et se faisait hisser 18.3.1 à la
racine, tandis que `packages/mobile` exige exactement `18.2.0` (contrainte
Expo SDK 51) et se retrouvait avec une copie imbriquée. Un hook invalide
n'est pas un problème web — ce bug aurait aussi crashé sur iOS/Expo Go dès
qu'un écran montait `NativeStackNavigator`. Corrigé via `"overrides"` npm à
la racine (`react`/`react-dom` forcés à `18.2.0` partout) + réinstallation
complète (suppression de tous les `node_modules` + lockfile, sinon npm ne
réappliquait pas l'override sur une install incrémentale). Vérifié : une
seule copie de `react` dans tout l'arbre, `npm ls react --all` ne montre
plus aucune résolution `invalid`.

**Testé en cliquant réellement dans tout le flux** (démarrer une session →
garder un morceau → garder tout → terminer → récapitulatif → historique →
réouverture d'une session archivée → profil → découvrir → mes musiques) :
plus aucune erreur console après le fix. Second bug trouvé au passage : le
bouton retour de `SessionRecapScreen` visait `navigate('Main')` en dur ;
depuis Historique → Récap, ça ne revenait pas au bon écran. Corrigé avec
`goBack()`/`canGoBack()`.

**Limite connue, non corrigée (web uniquement, sans impact iOS)** : le
bouton "Fermer" de la modale QR profil ne ferme pas la modale sous
`react-native-web` (le handler `onPress` React est bien attaché mais son
exécution ne déclenche pas la fermeture visible — vraisemblablement une
particularité de l'implémentation Modal/Pressable de react-native-web, pas
du code applicatif). `<Modal>` sur iOS utilise une présentation native
(UIKit) sans rapport avec cette implémentation web — non bloquant pour
TestFlight, pas d'investigation plus poussée pour l'instant.

## ⚠️ Contrainte d'environnement — session cloud précédente (historique)

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

- Moteur de session mobile : `HomeScreen` → `useSessionStore` (tick de
  reconnaissance répété, détection de silence) →
  `musicEngine.recognitionProvider` → `TrackResolver` →
  `SmartPlaylistRouter` → `keepTrackAction.commitKeep` →
  `musicEngine.musicProvider.addTrackToPlaylist` →
  `usePlaylistStore.refresh()` ; fin de session → `useSessionHistoryStore`
  (persistance AsyncStorage) → `SessionRecapScreen`/`SessionHistoryScreen`.
  Remplace l'ancien pipeline GARDER mono-morceau (`usePlayerStore`,
  supprimé de la navigation). Le code s'enchaîne logiquement et **bundle
  réellement avec Metro** (voir "Session locale du 21/08/2026" plus haut),
  mais n'a pas encore tourné sur un vrai appareil/Expo Go — statut
  CONNECTED, pas encore TESTED en conditions réelles.
- `ProfileScreen`/`DiscoverScreen` : profil complet (kind, ville/pays, site,
  styles/artistes favoris, réseaux sociaux avec visibilité publique/privée,
  infos privées séparées, QR profil réel via `react-native-qrcode-svg`,
  "Comparer nos KEEP" et KEEP DNA calculés pour de vrai via
  `computeMusicDNA`/`compareMusicDNA` sur les GARDER réels de
  `useSessionHistoryStore` — pas des pourcentages inventés) et Découvrir
  (profils/DJ/événements DÉMO explicitement labellisés, tendances
  personnelles calculées pour de vrai depuis l'historique local). Tous les
  boutons visibles déclenchent une action réelle (calcul, navigation,
  Alert, Share, permission) — aucun bouton décoratif.
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
- **22/08/2026 — route `/api/music/apple/developer-token` protégée.**
  C'était l'avertissement de sécurité permanent listé dans `routes/music.ts`
  ("NE PAS déployer sans middleware d'auth") : n'importe qui aurait pu
  distribuer des developer tokens Apple Music au nom du compte développeur
  KEEP. Corrigé : `src/lib/keepAuth.ts` (middleware, `TokenVerifier` injecté)
  + `src/lib/supabaseTokenVerifier.ts` (implémentation réelle via
  `supabase.auth.getUser()`, Supabase reste seul juge de la validité d'un
  token). Tant que `SUPABASE_URL`/`SUPABASE_ANON_KEY` ne sont pas définies,
  la route répond honnêtement `503 auth_not_configured` plutôt que d'être
  servie sans contrôle d'accès. **9/9 vérifications réelles** via
  `npx tsx packages/backend/scripts/verify-keep-auth.ts` (faux req/res, pas
  un mock du framework Express). `packages/backend/.env.example` était
  aussi périmé (variables `AUDID_API_KEY`/`SHAZAM_API_KEY` inutilisées,
  `APPLE_MUSICKIT_*` réellement lues par le code mais absentes du fichier)
  — corrigé pour refléter les vraies variables consommées par le code.
  `@types/cors` manquant empêchait aussi `tsc --noEmit` de tourner
  proprement sur `packages/backend` — ajouté.

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
