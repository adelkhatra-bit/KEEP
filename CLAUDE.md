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

**Règle permanente (demande explicite du 24/08/2026, après un audit Nemotron
limité aux tokens de design jugé insuffisant par Adel) : le design VU par
l'utilisateur prime sur la seule conformité aux tokens du Design System.**
Un audit qui vérifie uniquement `spacing.*`/`radius.*`/`typography.*` dans le
code peut PASS alors que le rendu réel est mal aligné, trop collé, ou
incohérent (composants parents, flex/grid, largeur de carte, responsive,
safe areas, états conditionnels -- rien de tout ça n'est capturé par un
grep de tokens). **Une UI ne devient PASS qu'après vérification visuelle
réelle (navigateur/Playwright/capture) ou un test E2E pertinent qui observe
le rendu, jamais sur la seule lecture du code source.** Si la vérification
visuelle n'est pas possible dans l'environnement (ex. pas de capture
d'écran disponible), le dire explicitement (`REAL VISUAL CHECK: PENDING`),
jamais déclarer PASS par défaut.

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

- **NVIDIA Build API** (connecté le 24/08/2026, clé dans `.nvidia.env`, gitignored -- 3e clé fournie par Adel est l'actuelle) — modèle `nvidia/nemotron-3.5-lightning-30b-a3b` via `https://integrate.api.nvidia.com/v1/chat/completions` (compatible OpenAI, function-calling supporté). **Branché** via `.claude/tools/nemotron-bridge.js` (voir section "Délégation Nemotron" ci-dessous) -- ce n'est plus un simple test, c'est l'agent de délégation réel du projet.
- **NVIDIA/skills** (installés le 24/08/2026 via `npx skills add NVIDIA/skills --skill <nom> --agent claude-code`, catalogue officiel `github.com/nvidia/skills`) -- `aiq-research` (Snyk Med Risk), `accelerated-computing-cudf` (1 alerte Socket), `cuopt-developer` (**Snyk Critical Risk**, non vetted, ne pas utiliser sans audit du contenu du skill d'abord). Aucun rapport identifié avec les besoins réels de KEEP (GPU dataframes, solveur d'optimisation logistique, RAG) -- installés sur demande explicite d'Adel, jamais utilisés, à ne pas invoquer sans raison concrète liée à KEEP.
- **Supabase Management API** (découvert le 24/08/2026 en corrigeant le bug RLS `social_links` -- `SUPABASE_MANAGEMENT_ACCESS_TOKEN`+`SUPABASE_PROJECT_REF` déjà présents dans `packages/backend/.env`, jamais documentés avant cette entrée) — `POST https://api.supabase.com/v1/projects/{ref}/database/query` (`{query: "<sql>"}`, header `Authorization: Bearer <token>`) exécute du SQL arbitraire, y compris DDL (CREATE POLICY, etc.), directement sur la vraie base KEEP. **Corrige une hypothèse fausse répétée dans plusieurs entrées de `KEEP_REGRESSION_TESTS.md`/`KEEP_MASTER_CHECKLIST.md`** ("service_role toujours un placeholder" -- vrai, mais ça ne veut plus dire qu'aucune écriture DB directe n'est possible) : les migrations `supabase/migrations/*.sql` n'ont plus besoin d'être collées à la main par Adel dans le SQL Editor, un agent (Claude ou Nemotron en LECTURE seule pour vérifier l'état -- jamais pour exécuter, cf. règles multi-agents) peut appliquer une migration directement, à condition que ce soit une action précise et autorisée explicitement par Adel à chaque fois (jamais une action de fond). Toujours vérifier l'état AVANT (ex. `select ... from pg_policies`) et APRÈS, jamais supposer qu'une requête a réussi sans relecture réelle.

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

## Délégation Nemotron (demande explicite du 24/08/2026 -- "économiser mon crédit Claude")

**Rôles fixes** : Claude Code = orchestrateur/superviseur. NVIDIA Nemotron
(`nvidia/nemotron-3.5-lightning-30b-a3b`, via `.claude/tools/nemotron-bridge.js`)
= agent de travail pour tout ce qui est LECTURE/RECHERCHE/AUDIT à volume --
jamais l'inverse.

**Ce qui va à Nemotron** (délègue automatiquement dès que pertinent, sans
redemander) : lecture massive de fichiers, recherche dans le repo, audits
(Design System, Auth/Brevo, profil/social, billing, Super Admin,
performance, sécurité), recherche de bugs/régressions, analyse de logs/
traces, revue de code, préparation de tests, analyse d'architecture.

**Ce qui reste à Claude, toujours** : décider quoi faire des conclusions,
appliquer/écrire les modifications, exécuter les tests finaux, créer les
checkpoints Git, arbitrer architecture/sécurité, bloquer une régression
immédiatement. Nemotron ne modifie jamais un fichier lui-même -- le bridge
n'expose AUCUN outil d'écriture, seulement lecture/recherche/tests fixes.

**Le bridge** (`.claude/tools/nemotron-bridge.js`, réutiliser jamais
reconstruire) : `node .claude/tools/nemotron-bridge.js <nom-de-tache>` avec
une tâche définie dans le fichier, ou `require('./.claude/tools/nemotron-bridge.js').runAgentTask(prompt, maxTurns)`
directement. Outils réels exposés : `list_directory`, `search_repo` (git
grep -- jamais `rg`, absent de cet environnement), `read_file_chunk`
(paginé offset/longueur, `has_more`/`next_offset` pour continuer), `git_status`,
`git_diff`, `git_log`, `run_typecheck`, `run_smoke_test`,
`read_recognition_traces`. Injecte automatiquement `CLAUDE.md` en préambule
-- Nemotron connaît le protocole avant de commencer, comme tout agent.

**Protection anti-boucle déjà intégrée** (testée en vrai le 24/08/2026,
confirmée PASS sur un vrai fichier de 40K caractères) : un appel identique
(même outil + mêmes arguments) au-delà de 2 répétitions est refusé avec un
message forçant un changement de stratégie ; plafond dur de 40 appels
d'outils par tâche. Si Nemotron boucle quand même ou n'aboutit pas, Claude
reprend la main -- jamais laisser tourner indéfiniment.

**Règles absolues** :
- Jamais recréer une fonction qui existe déjà sans l'avoir fait auditer
  d'abord (par Nemotron ou directement).
- Jamais déclarer PASS sur la seule lecture de code par Nemotron -- un
  élément testable doit être réellement testé (`run_typecheck`/
  `run_smoke_test`/navigateur), même conclusion que le reste de ce fichier.
- Ne jamais refaire intégralement à la main (Claude) une analyse que
  Nemotron peut faire -- mais Claude reste celui qui VALIDE la conclusion,
  jamais un relais aveugle.

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
