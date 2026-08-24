# KEEP — Protocole obligatoire (repo entier)

Ce fichier s'applique à tout le monorepo (`packages/mobile`, `packages/backend`,
`packages/admin`, `packages/music`). Instaure par Adel le 24/08/2026 après
plusieurs régressions causées par du travail fait sans relire les décisions
déjà prises. **Ces règles priment sur toute impression de "je m'en souviens".**

## Avant TOUTE tâche

1. Lire `docs/KEEP_MASTER_SPEC.md` — ce qu'est KEEP aujourd'hui.
2. Lire `docs/KEEP_MASTER_CHECKLIST.md` — ce qui reste à faire + statut réel.
3. Lire `docs/KEEP_DECISIONS.md` — ce qui a été validé et ne doit pas changer sans raison explicite.
4. Identifier les tests concernés dans `docs/KEEP_REGRESSION_TESTS.md`.
5. Pour toute tâche UI/visuelle : lire `docs/KEEP_DESIGN_SYSTEM.md` — source de vérité du Design System KEEP (tokens, tailles, règles "aucune valeur arbitraire" et "jamais de doublon de composant", validées par Adel le 24/08/2026).
6. Chercher si la fonction demandée existe déjà (grep/lecture directe — jamais supposer).
7. `git status` / `git diff` avant toute nouvelle intégration — savoir précisément ce qui est déjà modifié/non commité avant d'ajouter par-dessus.
8. Seulement ensuite commencer.

Ceci s'applique à TOUT agent travaillant sur ce repo, pas seulement Claude Code (cf. demande explicite du 24/08/2026 -- "travaille comme un lead développeur qui coordonne plusieurs équipes/agents : aucune duplication, aucune modification au hasard, aucune fonction cassée par la suivante"). Un deuxième agent (ex. Ox Alpha/Cline) doit lire ce fichier avant toute tâche KEEP, au même titre que Claude Code.

Au tout début d'une session, afficher un court résumé avant de reprendre :
```
CURRENT P0 :
CURRENT P1 :
LAST STABLE CHECKPOINT :
KNOWN FAILURES :
NEXT ACTION :
```
La prochaine action vient de `KEEP_MASTER_CHECKLIST.md` — ne pas demander
"que veux-tu faire ensuite ?", la reprendre directement.

## Avant de coder quoi que ce soit de nouveau : AUDIT FIRST

Répondre (même brièvement, en interne) avant d'écrire du code :
- `EXISTS` : YES / NO / PARTIAL
- `FILES` : fichiers concernés
- `DB` : tables/migrations existantes
- `API` : endpoints existants
- `UI` : écrans/composants existants
- `TESTS` : tests déjà présents
- `RISQUE DE RÉGRESSION` : liste

Si ça existe : réutiliser/réparer/brancher. Si ça n'existe pas : construire.
**Aucun doublon** — jamais une deuxième version d'un système qui existe déjà.

## Après chaque modification importante

1. Typecheck/lint si approprié (`npx tsc --noEmit -p .` dans le package touché).
2. Tests unitaires/intégration concernés.
3. Tests de régression critiques de `docs/KEEP_REGRESSION_TESTS.md`.
4. Mise à jour de `docs/KEEP_MASTER_CHECKLIST.md`.
5. Mise à jour de `docs/KEEP_DECISIONS.md` si une nouvelle décision produit a été validée par Adel.
6. Seulement ensuite passer à l'étape suivante.

**Ne jamais déclarer PASS parce que le code compile.** PASS = test réel exécuté et observé (curl, navigateur, trace serveur réelle).

Pour toute modification UI/frontend mobile ou admin : démarrer le serveur et
utiliser la fonctionnalité dans un navigateur avant de la déclarer terminée
(voir Browser tool). Si ce n'est pas testable en pratique, le dire
explicitement plutôt que de prétendre que c'est fait.

## Si une modification casse un test précédemment PASS

STOP. Ne pas continuer sur de nouvelles fonctionnalités. Trouver la
régression via `git diff`/`git log` (comparer avec la dernière version où ça
marchait, jamais deviner). Corriger. Relancer les tests. Seulement après un
retour PASS réel, continuer.

## Outils/clés connectés (mis à jour au fur et à mesure, jamais la valeur des secrets ici)

- **NVIDIA Build API** (connecté le 24/08/2026, clé dans `.nvidia.env`, gitignored) — accès à des modèles hébergés (DeepSeek, Llama 3.1, etc.) via `https://integrate.api.nvidia.com/v1/chat/completions` (compatible OpenAI). Vérifié réellement fonctionnel avec `meta/llama-3.1-8b-instruct` (HTTP 200). Certains IDs de modèles listés par `/v1/models` renvoient 404/410 sur cet compte (entitlement/fin de vie) -- toujours vérifier par un vrai appel avant de compter sur un modèle précis, jamais suivre `/v1/models` aveuglément. Pas encore branché à un pipeline précis -- clé confirmée valide, intégration concrète à faire au cas par cas, jamais avant que le P0 recognition soit réellement PASS (règle du 24/08/2026).

## Organisation multi-agents (demande explicite du 24/08/2026 — "CTO / Lead Developer / orchestrateur")

Claude Code (superviseur) peut déléguer à des sous-agents spécialisés
(`.claude/agents/audit.md`, `backend.md`, `frontend.md`, `super-admin.md`,
`qa.md`) — chacun lit ce fichier + les 4 `docs/KEEP_*.md` avant de travailler,
comme n'importe quel agent sur ce repo. Règles de dispatch :

- Jamais deux agents avec un accès en écriture sur les mêmes fichiers en
  même temps — le superviseur ne dispatche jamais deux tâches qui se
  recouvrent en parallèle.
- Le superviseur reste seul décideur pour : architecture, sécurité (RLS/
  auth/paiement), revue finale de chaque diff, et commit/checkpoint. Un
  sous-agent ne commit jamais lui-même.
- Un sous-agent ne marque jamais une tâche `PASS` sans preuve réelle — même
  règle que le reste de ce fichier, aucune exception parce que c'est "juste"
  un sous-agent.
- Séquence obligatoire pour toute modification, déléguée ou non :
  `AUDIT → BASELINE TESTS → MODIFICATION → DIFF REVIEW → TESTS → E2E → COMMIT/CHECKPOINT`.
  BASELINE = rejouer les tests `PASS` concernés de `docs/KEEP_REGRESSION_TESTS.md`
  AVANT de toucher au code, pour avoir un état de référence réel à comparer.
  Un `PASS` qui redevient `FAIL` après une modification = arrêt immédiat,
  correction ou rollback avant toute nouvelle fonctionnalité (voir section
  "Si une modification casse un test précédemment PASS" ci-dessus — ceci
  n'est pas une nouvelle règle, juste rendu non-contournable pour tout agent).

## Checkpoints Git

Avant un gros chantier, si le repo est dans un état stable : envisager un
commit de checkpoint clair (ex. `checkpoint: recognition working`). Après
une phase réellement PASS : commit clair (`feat: ...`, `fix: ...`). Ne
jamais faire de rollback global sans audit précis de ce qui a changé.

## Auto-check avant de déclarer une tâche terminée

- Ai-je relu la spec/les décisions concernées ?
- Cette fonction existait-elle déjà ? Ai-je créé un doublon ?
- Ai-je cassé une fonction précédemment PASS ?
- Ai-je testé le vrai backend (pas juste lu le code) ?
- Ai-je testé la persistance réelle ?
- Ai-je testé Guest ET Compte enregistré si la zone touchée les concerne tous les deux ?
- Ai-je mis à jour `KEEP_MASTER_CHECKLIST.md` ?
- Ai-je ajouté un test de régression si nécessaire ?

Si une réponse est NON, la tâche n'est pas terminée.

## Format de fin de phase

```
PASS RÉEL / PARTIAL / FAIL
REGRESSIONS FOUND
REGRESSIONS FIXED
CHECKLIST UPDATED
DECISIONS UPDATED
GIT CHECKPOINT
CE QUI RESTE À FAIRE
NEXT ACTION
```
