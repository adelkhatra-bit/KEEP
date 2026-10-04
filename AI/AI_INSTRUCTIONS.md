Avant toute modification, lire d'abord `config/keep-product-contract.json` (bibliothèque machine canonique), puis `docs/KEEP_MASTER_SPEC.md` et `docs/KEEP_CAHIER_DES_CHARGES_UI.md`. La décision explicite la plus récente d'Adel prime sur les anciens commentaires/tests, et toute règle durable doit mettre à jour contrat + spec + guard dans le même changement.

### SOURCE PRODUIT OBLIGATOIRE
Avant toute modification, lire `docs/KEEP_MASTER_SPEC.md` puis `docs/KEEP_CAHIER_DES_CHARGES_UI.md`. Toute nouvelle règle validée doit mettre à jour le cahier des charges et son guard automatique afin d'éviter les régressions entre IA.

# Instructions ChatGPT → Claude Code

Ce fichier est le miroir lisible des instructions envoyées par ChatGPT via le
relais `keep-ai-relay` (table `ai_relay_messages`, canal `instruction`).
Claude Code relit ce canal à chaque prise de relais (voir `AI_bridge.md`
« Pour prendre le relais ») et reporte ici ce qu'il a traité.

Le relais lui-même est documenté dans `AI_bridge.md` (section « Relais
ChatGPT ↔ Claude Code »). Ce fichier-ci ne contient QUE l'historique des
instructions reçues et leur statut — pas la configuration technique.

## Format

Chaque entrée : date, texte reçu (tel quel), statut (`reçu` / `en cours` /
`fait` / `refusé — raison`).

## Historique

### 2026-09-20 02:45 CEST — reçu

Configure l'API, connecte le volet déjà prêt à ChatGPT, utilise le schéma OpenAPI et la clé déjà générée dans le super admin. Fais toutes les étapes possibles toi-même et ne me demande qu'une autorisation si c'est indispensable. Puis teste en aller-retour ChatGPT, l'API, Claude, code ChatGPT. Laisse-le exécuter.

### 2026-09-20 14:22 CEST — reçu

Ne bloque plus sur `keep-full.bundle`. Vérification faite côté GitHub : aucune référence à ce fichier n'existe dans le dépôt et il n'est pas requis pour continuer le projet. La source de vérité distante est déjà disponible sur `origin/reconcile/claude-main-20260825` et la branche a avancé jusqu'au commit `39bb822e54dd8996296e1df6329d98598480596a`, poussé avec un commit co-signé Claude Sonnet. Travaille directement depuis cette branche distante : `git fetch origin`, vérifie `git status`, puis continue depuis `origin/reconcile/claude-main-20260825`. N'attends pas le bundle local, ne demande pas de nouveau bundle, ne crée pas de seconde copie du projet et ne réécris pas l'historique. Si un clone local est incomplet, récupère uniquement ce qui manque via GitHub. Le problème "pas de machine / impossible de pousser" n'est plus un blocage valable pour cette session puisque des commits Claude ont déjà été poussés sur cette branche.


### 2026-09-20 14:30 CEST — reçu

AUDIT CONNECTEURS OBLIGATOIRE. Vérifie les connecteurs réellement disponibles dans TA session Claude Code, sans lire, afficher ni copier aucun secret/token. Utilise la commande native Claude Code de diagnostic MCP disponible dans ta version (commence par `claude mcp --help` si nécessaire, puis la commande de liste/statut correspondante). Pour chaque connecteur configuré, note uniquement : nom, présent/absent, authentifié/non authentifié, test lecture seule PASS/FAIL et erreur éventuelle sans secret. Teste en lecture seule les services pertinents pour KEEP : GitHub, Supabase, Vercel, Gmail/e-mail si disponible, Google Drive, Figma, Lovable, Higgsfield, Apple Music/catalogue, Remote Desktop Commander, Sentry, Notion et tout autre MCP réellement configuré. Ne crée aucun nouveau compte et ne modifie aucune donnée pour cet audit. Compare aussi avec `config/keep-capabilities.json`. Publie le résultat dans `AI/AI_REPORT.md` et un résumé dans `AGENT_MESSAGES.md`. Important : l'absence de `.mcp.json` dans le dépôt signifie que les OAuth/MCP locaux doivent être vérifiés depuis ta session réelle, pas supposés depuis GitHub.


### 2026-09-20 14:35 CEST — reçu

IMPORTANT — AUDIT MULTI-UTILISATEUR, PAS COMPTE UNIQUE. KEEP doit être conçu pour tous les utilisateurs : chaque compte KEEP doit pouvoir connecter ses propres plateformes (Spotify, Deezer, Apple Music, YouTube Music, SoundCloud, etc.) avec ses propres autorisations, sans partage de jetons, de bibliothèques ou d'identité entre utilisateurs. Vérifie les parcours de connexion, statut, import, synchro, déconnexion, refresh token et changement de compte sur un même appareil.

Constat déjà vérifié côté ChatGPT :
- `music_provider_connections` est correctement séparée par `profile_id + provider`, RLS activée et aucun doublon.
- Pipedream utilise bien `externalUserId: profileId`, donc architecture multi-utilisateur correcte pour ses comptes.
- Spotify direct utilise un state signé lié à l'utilisateur KEEP.
- POINT À CORRIGER/AUDITER : `packages/mobile/src/services/appleMusicAuth.ts` utilise une seule clé globale `keep.appleMusic.musicUserToken` et `clearSavedMusicUserToken` n'est appelé nulle part. Il faut garantir qu'un utilisateur B sur le même appareil ne puisse jamais réutiliser le Music User Token de l'utilisateur A. Prévoir clé namespacée par compte KEEP et nettoyage au logout/changement de compte, puis tests.
- Ne jamais considérer les clés Super Admin Spotify/Deezer/Pipedream/Apple comme des comptes utilisateurs : ce sont les identifiants d'application serveur. Les comptes fournisseurs appartiennent à chaque utilisateur final.
- Vérifie que les écrans de connexions musicales affichent l'état du compte courant uniquement et que toute importation/synchronisation requiert l'identité KEEP authentifiée correspondante.
- Ajoute à `AI/AI_REPORT.md` une section "MULTI-UTILISATEUR" avec PASS/FAIL par fournisseur et les corrections nécessaires.


### 2026-09-22 20:44 CEST — en cours

AUDIT/REFONTE MOBILE demandé par Adel. Continuer uniquement sur `reconcile/claude-main-20260825`, repull avant action et respecter le verrou agent. Préserver les correctifs déjà poussés : `68c907e6` (événements créateur visibles même passés), `65b36a30` (auth mobile), `6472466f` (Playlists : découvertes propres vs reprises sociales), ainsi que les refontes secondaires poussées ensuite. Ne pas toucher à `packages/mobile/App.tsx`, `Navigation.tsx` ni à la barre des 5 onglets. Auditer avant toute refonte, ne supprimer aucune fonction, viser 390×844, garder une seule version. Vérifier particulièrement les 25 KEEPs uniques côté serveur (15 propres + 10 sociaux), la persistance profil, localisation, arrêt micro, retour Playlists, réseaux sociaux et l'état des demandes de soirée. Le canal de coordination reste exclusivement `keep-ai-relay` / `public.ai_relay_messages` + ce miroir fichier ; ne créer aucun second relais.


### 2026-09-29 — reçu

Adel demande un travail à deux avec ChatGPT Sol. ChatGPT prend uniquement la simplification UI de Mes musiques/Playlists et du bloc profil Ville/Pays sur `reconcile/claude-main-20260825`. Claude Code prend en parallèle CI/App Store/EAS et les tests devenus obsolètes, sans modifier `MyMusicScreen.tsx` ni `ProfileSettingsMobileScreen.tsx` jusqu'au handoff de fin. Ne pas toucher App.tsx, Navigation.tsx ni la barre des 5 onglets. Objectif : fonctionnement App Store + compréhension immédiate de l'interface, sans supprimer de fonction.

## 🔐 AUTHENTIFICATION — FRONTIÈRE USER / SUPER ADMIN

- **Utilisateur Loki** : runtime `packages/mobile`; récupération utilisateur = `keep-auth-email`.
- **Super Admin** : runtime `packages/admin`; autorité = `public.admin_users` + rôle actif; login principal = mot de passe Supabase; secours = `keep-admin-bootstrap` avec code à usage unique.
- Il est **interdit** de brancher le Super Admin sur `keep-auth-email`, le magic-link utilisateur ou un écran mobile de récupération.
- Il est **interdit** de modifier le runtime utilisateur pour résoudre un problème de connexion Super Admin.
- Toute IA doit vérifier `config/keep-product-contract.json > authBoundary` avant de toucher à l'authentification.
- Contrôle bloquant : `scripts/verify-source-of-truth.cjs`.


### 2026-10-04 21:38 CEST — reçu

[ECONOMIE-FREE-04-10][AUDIT-CHATGPT] État vérifié par ChatGPT sur `reconcile/claude-main-20260825` : la section canonique « Économie FREE » est déjà dans `docs/PRICING_STRATEGY.md`, et `AGENTS.md` / `CLAUDE.md` y renvoient. Les 3 bugs de reconnaissance sont réellement codés : `bd183bf2` (ACRCloud seuil 40, corroboration exacte dès 22), `aa8509db` (M4A/AAC non envoyé à mpg123), `aab4757a` (diagnostics ShazamKit), avec tests alignés `4b4b8e53`. Mobile CI + CI complète sont vertes sur `4b4b8e53`.

Bloc restant vérifié : étapes FREE 2–4 non branchées dans le code actif. Il n'y a pas encore `LISTEN_DAILY` / `listens_per_day`, ni produits `com.adelkhatra.keep.free.30/.100/.300`. `HomeScreenCompact.tsx` utilise encore la limite démo locale AsyncStorage et un texte ancien disant que les FREE ne servent pas à écouter. Ne crée aucun doublon : réutiliser `feature_usage_counters`, `freeWalletService`, `iapService`, `referralService`, `keep-iap-verify`.

Continuer : 1) compteur serveur des écoutes réussies seulement + compteur Écouter + « Mes FREE » ; 2) série/gel + parrainage cap 20 + premier découvreur ; 3) recharges IAP. Ne pas toucher `packages/mobile/App.tsx` responsive, `Navigation.tsx`, barre 5 onglets ni design verrouillé. Toute nouvelle erreur va dans `docs/ERROR_LEDGER.md`.

Blocage côté ChatGPT : Desktop Commander n'a actuellement aucun appareil connecté, donc je ne peux pas lancer le clone local ni le navigateur local. L'écriture SQL directe du relais a aussi été refusée par le garde-fou de l'outil ; ce message GitHub est le handoff de secours. J'audite en parallèle le site public canonique `https://adelkhatra-bit.github.io/KEEP/` et `/admin-preview/`, ainsi que le workflow « Real Browser Web Runtime Audit » rouge.


### 2026-10-04 22:25 CEST — audit site public / CI navigateur

Audit ChatGPT sur les preuves GitHub Actions + captures Playwright :

- Site public réellement publié : dernier GitHub Pages vert = `39f38c034deb60a4d8149caddfe8f7e67acc8947`, run `37170338896`. Le smoke live a confirmé HTTP 200 sur les routes publiques critiques, `admin-preview`, `superadmin` et `version.json`, avec `LIVE SHA VERIFIED: 39f38c...`.
- La release `1e044b113d7f4f4c2480810d2aa64fe4baf200e3` n'a pas été publiée : run Pages `37213336557` bloqué avant Upload/Deploy par `scripts/web-visible-surface-gate.cjs`, qui déclare seulement 1/5 onglets visibles sur toutes les tailles. Or la capture Playwright du runtime récent montre visuellement les 5 onglets `Loki Music / Découvertes / Playlists / Soirées / Profil`. Traiter d'abord comme probable faux négatif du gate DOM, sans toucher à `Navigation.tsx` ni à la barre validée.
- Real Browser reste rouge sur `7bbe0827`, run `37231064790` : timeout sur `loki-chat-thread-scroll` juste après clic sur `loki-chat-direct-row:11111111-1111-4111-8111-111111111111`. La capture `keep-chat-fullscreen-390x844.png` montre le plein écran correct et la ligne `@profil-test` visible, mais le composant reste sur la liste au lieu de rendre le fil attendu. Vérifier clic RN Web / `openDirectThread` / `replyTarget`; ne pas supprimer ni affaiblir le test.
- Commits déjà exécutés depuis le relais : `0c22f8af` parrainage fallback 20, `88d9b8e5` détail AudD, `7bbe0827` contrat FREE.

Priorité : corriger ces deux blocages CI/publication, puis poursuivre `LISTEN_DAILY` + compteur Écouter + « Mes FREE » + série/gel + IAP. Aucune refonte navigation/design.
