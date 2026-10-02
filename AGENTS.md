## BIBLIOTHÈQUE PRODUIT CANONIQUE — À LIRE EN PREMIER
Avant toute action, lire `config/keep-product-contract.json`. C'est la bibliothèque machine anti-régression de KEEP. Si un ancien commentaire, test, message agent ou document contredit la décision explicite la plus récente d'Adel et ce contrat, il est obsolète et doit être corrigé dans le même commit. Une correction UI ne doit jamais modifier des données utilisateur réelles (certification, FREE, profil) pour « faire correspondre » l'écran.

## CAHIER DES CHARGES PRODUIT OBLIGATOIRE
Lire `docs/KEEP_MASTER_SPEC.md` — cahier des charges maître obligatoire — puis `docs/KEEP_CAHIER_DES_CHARGES_UI.md` avant toute modification. Une modification qui contredit ces fichiers sans nouvelle demande explicite est une régression.

## AVANT TOUTE ACTION
Consulter `.rtk/AGENTS_RULES.md` — règles absolues du projet Loki Music.

# KEEP — Instructions agents (Codex CLI, et tout agent qui lit AGENTS.md)

Ce dépôt est aussi piloté par Claude Code, qui suit `CLAUDE.md` (racine du repo) —
lis-le en entier avant de travailler, il contient le protocole complet (audit avant
toute tâche, jamais de doublon, jamais PASS sans preuve réelle). Ce fichier
`AGENTS.md` n'est PAS une deuxième version de ces règles — il pointe vers la même
source unique et ajoute uniquement ce qui est spécifique à un agent qui travaille
dans ce dossier EN PARALLÈLE de Claude Code.

## 🧭 GPS DU CODE + MÉMOIRE ANTI-RÉGRESSION

Avant toute modification, lire aussi :
- `docs/CODE_GPS.md` — carte des dossiers, propriétaires fonctionnels et flux critiques ;
- `docs/ERROR_LEDGER.md` — erreurs connues, causes racines, statut et preuve ;
- `docs/INTEGRATION_CHECKLIST.md` — checklist obligatoire d'intégration.

Toute nouvelle erreur réelle doit être ajoutée à `docs/ERROR_LEDGER.md` avant ou dans le même commit que son correctif. **Ne jamais supprimer une erreur du registre** : la passer à `VERIFIED` uniquement avec SHA + test/preuve. Toute refonte qui rend un test obsolète doit expliquer pourquoi et conserver les assertions de sécurité/fonction qui restent vraies.

## 🧠 MÉMOIRE PARTAGÉE

- **Avant toute session, lire `PROJECT_STATE.md`** (racine du repo) : tableau de bord unique (état git, fonctionnalités actives, points ouverts, APIs).
- Avant toute action, consulte le dossier `.context/` pour connaître l'état actuel du projet.
- Lis en priorité `.context/activeContext.md` pour savoir où on en est.
- À la fin de chaque session importante, mets à jour `.context/activeContext.md` **et** la section « Points ouverts » de `PROJECT_STATE.md`.
- Avant un commit significatif : `node scripts/update-project-state.cjs`.
- **Une fois par clone** : `git config core.hooksPath .githooks` (rappel pre-commit + sync post-merge de `PROJECT_STATE.md`).

La mémoire `.context/` transmet l'état de travail entre agents ; elle ne remplace ni le code, ni le schéma Supabase réel, ni les règles de `CLAUDE.md` et `AGENTS.md`.

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

## 🔒 CONNEXION — RÈGLE VERROUILLÉE PAR LE CODE (incident 02/10/2026)

Le 02/10/2026, plus personne ne pouvait se connecter : un sondage réseau toutes les 800 ms a épuisé la base Supabase, puis l'app abandonnait chaque connexion après 3,5 s et relançait jusqu'à 3 fois, alors que Supabase Auth met jusqu'à 10 s à répondre. Résultat : des requêtes empilées et des connexions impossibles. Ce n'est **pas** une consigne à interpréter, c'est un **contrôle bloquant** :

- Valeurs chiffrées : `config/keep-product-contract.json` > `authResilience`.
- Contrôle : `scripts/verify-product-contract.cjs`, appelé par `verify-source-of-truth.cjs`. **S'il échoue, la publication web et l'OTA mobile sont refusées.**
- Interdit : échéance de connexion ≤ 10 s, relance après une échéance locale, relance d'un serveur déjà lent (> 5 s), plus de 2 tentatives, nouveau `setInterval` < 5 s non déclaré dans `fastIntervalAllowlist` avec sa raison.
- Pour changer une valeur : modifier le contrat **et** le code dans le même commit, avec la justification. Ne jamais affaiblir le contrôle pour « faire passer » un push.
- Si la connexion casse : regarder d'abord les journaux Supabase Auth (`auth_logs`, `edge_logs` `/auth/v1/token`) **avant** de modifier le code. Un 504 « context deadline exceeded » = serveur saturé, pas un bug de mot de passe ni un compte désactivé.

## Jamais toucher

`main` et `claude-local-backup-20260825` — ne jamais push, merge, ni rebase dessus
depuis cet agent.

## Communication entre agents

Avant de modifier le code, lire aussi `AI/AI_INSTRUCTIONS.md` et `AI/AI_REPORT.md`.
Le canal canonique ChatGPT ↔ Claude Code est `keep-ai-relay` /
`public.ai_relay_messages` ; ne jamais créer un second relais, et ne jamais
copier une clé du relais dans le code ou le journal.

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


## 🔴 RÈGLE ABSOLUE — ÉTAT LOCAL ≠ REMOTE ≠ TESTÉ ≠ DÉPLOYÉ

Cette règle est permanente et s'applique à tous les agents.

Statuts autorisés pour décrire un changement :
- `LOCAL_ONLY` : présent uniquement dans le clone local ;
- `COMMITTED_LOCAL` : commit local créé mais non visible sur GitHub ;
- `PUSHED_REMOTE` : SHA visible sur `adelkhatra-bit/KEEP`, branche `reconcile/claude-main-20260825` ;
- `TESTED_REMOTE` : commit distant + tests/CI ciblés réellement vérifiés ;
- `DEPLOYED` : version réellement publiée et contrôlée sur la cible.

Avant d'annoncer `PUSHED_REMOTE` ou plus, l'agent doit :
1. vérifier le repository et la branche exacts ;
2. relire le HEAD distant ;
3. vérifier que le contenu distant du fichier contient réellement la modification ;
4. pour un workflow, vérifier le YAML distant ;
5. pour une CI, citer le run réel et son résultat ;
6. pour un déploiement, vérifier la cible réelle.

Si une permission empêche le push, écrire explicitement `LOCAL_ONLY — PUSH BLOQUÉ` ou `COMMITTED_LOCAL — PUSH BLOQUÉ`. Il est interdit de dire « poussé », « intégré », « testé » ou « déployé » sans preuve correspondante.

Toute erreur trouvée doit être inscrite dans `docs/ERROR_LEDGER.md` et ne jamais être supprimée : elle passe à `VERIFIED` uniquement avec SHA + test/preuve.

## RÈGLE IMMUABLE — PREMIÈRE ÉCOUTE / PREMIER DÉCOUVREUR
- Une musique reçoit un premier découvreur Loki une seule fois. Cette attribution est immuable et doit survivre aux GARDER, reprises, partages, migrations et mises à jour.
- Un utilisateur qui reprend gratuitement une découverte publique conserve la provenance du premier découvreur ; il ne devient jamais le premier découvreur par propagation.
- Tous les Swipe/profils doivent afficher le premier découvreur quand il diffère du propriétaire courant et proposer VOIR LE PROFIL près du lien d’écoute complète.
- Une mise à jour ne doit jamais effacer ni réattribuer cette provenance.
