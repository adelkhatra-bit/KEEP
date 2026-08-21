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

- `MusicProviderAdapter` (interface) — aucune implémentation Spotify/Apple
  Music réelle encore écrite, seulement `DemoMusicProvider`.
- `MusicRecognitionProvider` (interface) — aucune implémentation AudD/ACRCloud
  réelle encore écrite, seulement `DemoRecognitionProvider`.
- Backend Express (`packages/backend`) : uniquement un health-check, aucune
  route métier.
- Super Admin Next.js (`packages/admin`) : page d'accueil statique
  uniquement, aucun des écrans du cahier des charges (§45-63).
- Onboarding (Apple/Google/Email) : les boutons existent et réagissent
  honnêtement ("backend pas encore connecté"), aucune authentification
  réelle.

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
| Déploiement Supabase (schéma déjà prêt) | Aucun projet Supabase KEEP n'existe. Connecteur Supabase disponible dans le registre mais non installé pour cette organisation. | Connecter le connecteur Supabase (méthode sécurisée, pas de clé à coller ici), ou créer le projet et transmettre l'URL. |
| Reconnaissance musicale réelle (AudD) | Aucune clé API AudD. | Créer un compte AudD (free tier 300 requêtes sans CB) et fournir la clé via une méthode sécurisée. |
| Spotify Extended Quota (>5 comptes) | Nécessite 250k MAU + entité légale (voir PLATFORM_COMPLIANCE.md) — non actionnable maintenant. | Décision produit : Apple Music comme provider principal du lancement. |
| Apple Developer / Google Play accounts | Nécessite identité, paiement, 2FA personnels. | Voir ACTION UTILISATEUR REQUISE ci-dessous. |

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

**5. Apple Developer Program / Google Play Console**
Service : Apple / Google
Pourquoi : identité, paiement et 2FA personnels — je ne peux légalement pas
le faire à ta place.
Action exacte : à faire uniquement quand on approche TestFlight/Play
testing (Priorité 12 du cahier des charges) — pas bloquant maintenant.
Temps estimé : variable.
