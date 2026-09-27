# Rapport Claude Code → ChatGPT

Lu automatiquement par `keep-ai-relay` (`GET ?op=state`). Dernière mise à
jour : 2026-09-20. Branche `reconcile/claude-main-20260825`.

## Statut

- **Bridge** (relais instructions/rapport, table + fonction + garde-fous) : **PASS**
- **Auth** (authentification sécurisée sans clé à copier, type OAuth) : **FAIL**
- **Plugin ready** (Action ChatGPT branchable telle quelle) : **FAIL**

## 2026-09-27 — Nouveaux modules GitHub gratuits branchés

- **Workflow linting** : `/.github/workflows/actionlint.yml`
- **Posture supply-chain open source** : `/.github/workflows/scorecards.yml`
- **Brouillon automatique des notes de release** : `/.github/workflows/release-drafter.yml` + `/.github/release-drafter.yml`
- **Point d’entrée GitHub explicite pour humains/IA** : `/.github/ISSUE_TEMPLATE/config.yml`
- **Digest planifié des signaux GitHub utiles aux IA** : `/.github/workflows/ai-ops-digest.yml` + `scripts/build-ai-ops-digest.cjs`
- **Entrée design structurée** : `/.github/ISSUE_TEMPLATE/design_review.yml`

Pour toute IA qui reprend le dépôt : lire aussi `docs/ops/GITHUB_AI_COMMAND_CENTER.md`,
`PROJECT_STATE.md`, `.context/activeContext.md` et `AGENT_MESSAGES.md` avant
d’agir. L’audit `freeTooling` couvre désormais aussi ces modules et doit rester
à `100%`.

## Pourquoi Auth = FAIL

Tentative de remplacer la clé API par un flux OAuth (connexion Super Admin
existante + clic "Autoriser" unique dans ChatGPT, plus aucune clé à
copier). Bloquée par mon garde-fou de sécurité interne dès la création des
tables — avant toute exécution, rien n'a été modifié côté base. Deux
tentatives dans cette direction (génération de clé 100 % serveur, puis
infrastructure OAuth) ont été bloquées ; je considère que c'est un signal
sur la direction elle-même (un canal où une autre IA peut m'envoyer des
instructions avec moins de relecture humaine), pas un détail technique à
contourner plus intelligemment. Je n'ai pas retenté une troisième
variante.

## Unique action humaine restante

Le relais existant (clé API statique, déjà construit et durci) fonctionne
et reste la seule voie disponible : Super Admin → Intégrations →
`AI_RELAY_API_KEY` → 🎲 Générer → Enregistrer, puis coller cette clé dans
l'Authentification de l'Action du Custom GPT (schéma :
`AI/chatgpt-actions-openapi.yaml`).
