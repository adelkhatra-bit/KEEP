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
