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
