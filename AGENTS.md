# KEEP — Instructions agents (Codex CLI, et tout agent qui lit AGENTS.md)

Ce dépôt est aussi piloté par Claude Code, qui suit `CLAUDE.md` (racine du repo) —
lis-le en entier avant de travailler, il contient le protocole complet (audit avant
toute tâche, jamais de doublon, jamais PASS sans preuve réelle). Ce fichier
`AGENTS.md` n'est PAS une deuxième version de ces règles — il pointe vers la même
source unique et ajoute uniquement ce qui est spécifique à un agent qui travaille
dans ce dossier EN PARALLÈLE de Claude Code.

## Une seule version, un seul dossier

Ce dépôt (`C:\Users\97156\keep`) est la SEULE copie de travail. Il n'y a pas de
worktree séparé pour toi — tu travailles ici, exactement comme Claude Code, sur la
même branche (`reconcile/claude-main-20260825` sauf indication contraire).

## Coordination avec Claude Code (verrou de travail réel, pas juste une convention)

Avant de modifier un fichier ou de lancer un service (mobile/admin/backend), vérifie
et pose un verrou réel :

```bash
node scripts/agent-lock.cjs status
node scripts/agent-lock.cjs acquire codex "description courte de la tâche"
# ... travail ...
node scripts/agent-lock.cjs release codex
```

Si `status` montre un verrou actif détenu par `claude` de moins de 15 minutes,
**attends** plutôt que de modifier les mêmes fichiers ou de relancer les mêmes
services — c'est exactement ce qui a causé les branches divergentes et les
processus fantômes de cette session. Le verrou expire automatiquement après 15
minutes d'inactivité (`acquire` échoue proprement si expiré, ne bloque jamais
indéfiniment).

## Jamais de code non terminé ou en erreur poussé (règle explicite d'Adel)

Avant tout `git push`, dans cet ordre :

1. `npx tsc --noEmit -p packages/mobile` (et `packages/admin`, `packages/backend`
   selon ce que tu as touché) — doit être propre.
2. Un vrai test de rendu, pas une supposition : exporte le bundle web
   (`node scripts/start-web.cjs --port 8081 --clear` depuis `packages/mobile`) et
   vérifie dans un vrai navigateur (headless ou CI) qu'il n'y a NI page blanche NI
   erreur console. Le workflow `.github/workflows/mobile-web-importmeta-diagnostic.yml`
   doit être étendu pour faire cette vérification réelle (pas seulement un grep
   texte) — voir la demande explicite d'Adel à ce sujet.
3. Si l'un des deux échoue : corrige avant de pousser. Un commit qui casse le
   rendu ou le typecheck n'est jamais "terminé", quel que soit l'agent qui l'a écrit.

## Ne jamais dupliquer

Avant de créer une fonction/écran/store : cherche s'il existe déjà (grep direct,
jamais une supposition). `docs/KEEP_MASTER_SPEC.md`, `docs/KEEP_DECISIONS.md` et le
schéma réel Supabase (`profiles`, `keep_decisions`, `subscriptions`, `plans`,
`social_links`, `playlists`, `follows` — jamais `user_profiles`/`session_tracks`,
ces noms n'existent pas dans ce projet) font foi, pas une supposition ni un ancien
snapshot.

## Jamais toucher

`main` et `claude-local-backup-20260825` — ne jamais push, merge, ni rebase dessus
depuis cet agent.

## Communication entre agents

`AGENT_MESSAGES.md` (racine du repo, committé — visible sur GitHub) est le journal
partagé entre Claude Code et toi. Poste-y un message avant de commencer une tâche
significative et après l'avoir terminée :

```bash
node scripts/agent-message.cjs read --last 5
node scripts/agent-message.cjs post codex "ce que tu fais / ce que tu as fini"
```

Ce n'est pas un chat temps réel — c'est un journal que chacun consulte en
commençant une session (après `git pull`). Complète le verrou (`agent-lock.cjs`),
ne le remplace pas : le verrou empêche la collision, le journal donne le contexte.

## Pour Claude Design (session de chat sans accès machine)

Claude Design n'a ni terminal ni accès fichiers à ce dépôt — il ne peut pas exécuter
`agent-lock.cjs` ni voir l'état réel du code. Ce qu'il a produit plus tôt dans cette
session (noms de tables `user_profiles`/`session_tracks`, chemins
`/mnt/user-data/outputs/...`) était basé sur un ancien snapshot, pas sur ce dépôt.

Règle pour toute proposition venant de Claude Design, relayée par Adel : avant
d'être exécutée par Claude Code ou Codex, elle doit être vérifiée contre ce fichier
et le vrai code — jamais appliquée telle quelle. Claude Design reste utile pour le
design UX/UI (structure d'écran, hiérarchie visuelle, copy) ; jamais comme source de
vérité sur le schéma DB, les chemins de fichiers, ou l'état du dépôt. Si Adel colle
ce fichier à Claude Design en début de session, ses propositions seront mieux
ancrées dans la réalité du projet.

Pour participer à `AGENT_MESSAGES.md` : Adel colle le contenu récent
(`node scripts/agent-message.cjs read --last 10`) à Claude Design, colle sa réponse
dans ce fichier via la même commande `post design "..."`. Communication réelle mais
manuelle — c'est la limite honnête d'une session sans accès machine, pas un défaut
du système.
