# GitHub AI Command Center — KEEP

## But

Ce document définit le **poste de commandement GitHub-native** pour coordonner
les IA qui travaillent sur KEEP sans ouvrir de deuxième canal ni se marcher
dessus.

Le centre de commande repose sur quatre briques complémentaires :

1. **`keep-ai-relay` / `public.ai_relay_messages`** — transport machine pour les
   consignes inter-IA.
2. **`AGENT_MESSAGES.md`** — journal humain partagé, versionné dans le dépôt.
3. **`scripts/agent-lock.cjs`** — verrou anti-collision avant toute édition.
4. **`agent-command-triage.yml`** — commentaire de routage GitHub maintenu
   automatiquement sur chaque issue.
5. **`free-tooling-audit.yml`** — audit automatique de l’exploitation des
   modules gratuits contrôlables depuis le dépôt.

## Source de vérité

- Dépôt unique : `adelkhatra-bit/KEEP`
- Branche source produit : `reconcile/claude-main-20260825`
- UI verrouillée par défaut : ne jamais contourner `CLAUDE.md` / `AGENTS.md`
- Pas de second centre de commande, pas de second journal, pas de second relais

## Comment une tâche doit circuler

### 1. Entrée

Une demande entre par :

- une issue GitHub classique ;
- une issue créée avec `/.github/ISSUE_TEMPLATE/agent_task.md` ;
- le relais `keep-ai-relay` quand ChatGPT ou Claude injecte une consigne.

### 2. Triage automatique GitHub

Le workflow `/.github/workflows/agent-command-triage.yml` :

- lit le titre, le corps et les labels de l’issue ;
- déduit le **type** dominant (`ci`, `data`, `design`, `general`) ;
- propose l’**agent visé** (`codex`, `claude`, `design`) ;
- rappelle les **workflows à lancer** ;
- republie un commentaire unique de coordination avec un marqueur stable.

Le workflow `/.github/workflows/sync-github-labels.yml` complète ce triage en
créant/synchronisant automatiquement les labels définis dans
`config/github-ai-command-center.json`, y compris `stale`, `no-stale`,
`blocked`, `security` et `work-in-progress`.

### 3. Exécution

Avant tout code :

```bash
node scripts/agent-lock.cjs status
node scripts/agent-lock.cjs acquire codex "description courte"
node scripts/agent-message.cjs read --last 10
```

Ensuite seulement, l’agent travaille sur son périmètre.

### 4. Handoff

À chaque étape notable :

```bash
node scripts/agent-message.cjs post codex "ce qui a été fait / ce qui bloque"
node scripts/agent-lock.cjs release codex
```

## Routage standard

### `codex`

À privilégier pour :

- GitHub Actions / CI rouges ;
- workflows, logs, validations, builds, déploiements ;
- smoke tests web/mobile ;
- corrections infra qui n’empiètent pas sur les écrans verrouillés.

### `claude`

À privilégier pour :

- Supabase, schéma, migrations, RLS ;
- auth, persistance, stockage ;
- flux Edge Functions / backend / données.

### `design`

À privilégier pour :

- structure UX/UI ;
- hiérarchie visuelle ;
- copy produit et cohérence d’écrans ;
- jamais comme source de vérité DB/infra.

## Workflows recommandés par type

### CI / Build / Déploiement

- `full-stack-ci.yml`
- `mobile-ci.yml`
- `keep-dual-viewport-guardian.yml`
- `keep-human-guardian.yml`
- `codeql.yml`

### Web / Pages / Routage

- `web-preview-pages.yml`
- `mobile-web-importmeta-diagnostic.yml`
- `public-trial-smoke.yml`

### Battle / smoke utilisateur

- `keep-dual-viewport-guardian.yml`
- `keep-battle-solo-guardian.yml`
- `keep-human-guardian.yml`

### Données / Supabase

- `verify-migrations.yml`
- `data-preservation.yml`
- `full-stack-ci.yml`

### iOS / EAS / TestFlight

- `auto-eas-build.yml`
- `eas-build-ios.yml`
- `app-store-native-preflight.yml`

## Garde-fous permanents

- **Jamais** de modifications concurrentes sur les fichiers déjà réservés par un
  autre agent.
- **Jamais** de deuxième canal de coordination hors `keep-ai-relay`,
  `AGENT_MESSAGES.md` et le verrou agent.
- **Jamais** d’annonce `PUSHED_REMOTE` / `TESTED_REMOTE` / `DEPLOYED` sans
  preuve correspondante.
- **Jamais** de réécriture silencieuse d’un workflow rouge : la cause racine
  doit être écrite dans `docs/ERROR_LEDGER.md`.

## Audit d’exploitation “100%”

Le workflow `/.github/workflows/free-tooling-audit.yml` exécute
`scripts/audit-free-tooling-coverage.cjs` et vérifie que l’inventaire
`freeTooling` de `config/keep-capabilities.json` reste à **100%** sur le
périmètre gratuit et réellement contrôlable dans le dépôt.

Cela couvre notamment :

- GitHub Actions CI ;
- actionlint sur les workflows GitHub ;
- GitHub Pages ;
- CodeQL ;
- OpenSSF Scorecards ;
- dependency review sur les PRs ;
- Dependabot ;
- artifacts ;
- templates + CODEOWNERS ;
- Release Drafter ;
- digest Ops / IA planifié ;
- déploiement web guidé par l’impact ;
- sync automatique des labels GitHub ;
- hygiène prudente des issues/PRs dormantes ;
- relais IA ;
- triage automatique des issues ;
- triggers `workflow_dispatch` / `schedule` ;
- build iOS local gratuit sur runners macOS GitHub publics.

Les autres IA doivent donc désormais auditer en priorité :

- `/.github/workflows/actionlint.yml`
- `/.github/workflows/scorecards.yml`
- `/.github/workflows/release-drafter.yml`
- `/.github/release-drafter.yml`
- `/.github/ISSUE_TEMPLATE/config.yml`
- `/.github/workflows/ai-ops-digest.yml`
- `scripts/build-ai-ops-digest.cjs`
- `/.github/ISSUE_TEMPLATE/design_review.yml`
- `/.github/workflows/ci-impact-analysis.yml`
- `scripts/resolve-ci-impact.cjs`
- `scripts/resolve-web-deploy-scope.cjs`
- `/.github/workflows/dependency-review.yml`
- `/.github/workflows/sync-github-labels.yml`
- `scripts/sync-github-labels.cjs`
- `/.github/workflows/stale-hygiene.yml`
- `/.github/ISSUE_TEMPLATE/incident_report.yml`

## Déploiement web intelligent

Le workflow `/.github/workflows/web-preview-pages.yml` s’appuie maintenant sur :

- `scripts/resolve-ci-impact.cjs` pour calculer les modules réellement touchés ;
- `scripts/resolve-web-deploy-scope.cjs` pour décider si le push exige :
  - un **full-site** avec matrice navigateur complète ;
  - un scope **admin-only** plus léger ;
  - et donc quels smokes/tests lourds sont vraiment nécessaires.

Objectif : conserver la chaîne GitHub Pages unique, garder un `push => visible`
rapide et réduire les rebuilds / audits navigateur inutiles quand le runtime
public n’est pas impacté.

## Architecture CI modulaire (priorité KEEP)

La CI ciblée KEEP doit désormais suivre la chaîne unique suivante :

`DIFF → MODULE AFFECTÉ → DÉPENDANCES → TESTS CIBLÉS → BUILD CIBLÉ → TEST NAVIGATEUR → PUBLICATION`

La configuration machine-lisible vit désormais dans `config/github-ai-command-center.json > ciArchitecture` et doit rester la **seule** matrice de référence pour :

- les modules (`PROFILE`, `PROFILE_MARKETPLACE`, `LISTEN_MIC`, `AUDIO_CORE`, `PLAYLISTS`, `BATTLE`, `PARTIES`, `AUTH`, `SUPABASE`, `SUPER_ADMIN`, `NAVIGATION`, `SHARED_CORE`, `SWIPE`) ;
- leurs dépendances directes ;
- leurs consommateurs directs ;
- les niveaux `LOCAL_TARGETED`, `INTEGRATION`, `GLOBAL` ;
- les règles de rebuild web et la sortie standard obligatoire.

### Règle de propagation

On ne raisonne plus seulement « fichier modifié = module ». Le résolveur `scripts/resolve-ci-impact.cjs` calcule :

1. module(s) touché(s) par le diff ;
2. dépendances directes à garder visibles dans le rapport ;
3. consommateurs directs à revalider si la brique touchée est partagée ;
4. tests à lancer et tests explicitement non nécessaires ;
5. nécessité (ou non) d’un rebuild/runtime web.

**Aucune propagation récursive** à toute l’application n’est autorisée sans raison démontrée.

### Workflows intégrés

- `ci-impact-analysis.yml` : produit le routage CI ciblé et publie la sortie standard.
- `profile-marketplace-contract.yml` : exécute le contrat navigateur prioritaire `PROFILE_MARKETPLACE` quand le diff le requiert.

### Contrat prioritaire `PROFILE_MARKETPLACE`

Le contrat navigateur prioritaire est stocké dans `ciArchitecture.browserContracts.PROFILE_MARKETPLACE` et verrouille désormais, sur **desktop + 390×844** :

- profil visiteur chargé ;
- bloc `SÉLECTION EXCLUSIVE` visible ;
- bouton `ÉCOUTER` / préécoute anonyme réellement lançable ;
- modale `PlaylistSaleImmersivePreview` visible ;
- preview disponible ;
- audio réellement démarré ;
- pause / reprise réelles ;
- fermeture de la modale.

Le PASS n’est donc plus accordé sur la simple présence d’un bouton dans le TSX.

### Sortie standard obligatoire

Chaque workflow ciblé doit publier exactement les champs suivants :

- `MODULE`
- `DÉPENDANCES IMPACTÉES`
- `FICHIERS MODIFIÉS`
- `TESTS LANCÉS`
- `TESTS NON NÉCESSAIRES`
- `SHA`
- `VERSION WEB TESTÉE`
- `DESKTOP`
- `390×844`
- `DÉPLOIEMENT`
- `ERREURS RESTANTES`

Cette sortie standard est générée par `scripts/resolve-ci-impact.cjs` pour éviter un second système parallèle.

## Digest Ops / IA

Le workflow `/.github/workflows/ai-ops-digest.yml` construit un digest
machine/humain avec :

- les workflows rouges récents sur la branche source ;
- les PR ouvertes ;
- les issues agents ouvertes ;
- les bugs ouverts ;
- la dernière couverture `freeTooling`.

Le rapport est publié dans `artifacts/ai-ops-digest/report.md` et doit être relu
par toute IA qui reprend un chantier CI/ops important.

## Hygiène stale à grande échelle

Le workflow `/.github/workflows/stale-hygiene.yml` aide à garder un backlog
actionnable :

- issues sans activité depuis 45 jours → marquées `stale`, puis fermées 14 jours plus tard ;
- PR sans activité depuis 30 jours → marquées `stale`, mais **jamais fermées automatiquement** ;
- labels `no-stale`, `security`, `blocked`, `agent-task` et PR draft exemptés.

Le but n’est pas de supprimer du contexte, mais d’éviter qu’un dépôt chargé soit
pollué par des tickets morts que les IA et les humains doivent relire inutilement.

## Définition du “100% coordination”

Le système est considéré complet quand :

1. chaque demande significative a une issue ou une trace dans `AGENT_MESSAGES.md` ;
2. chaque issue possède un commentaire de routage unique et à jour ;
3. chaque agent prend un verrou avant édition ;
4. chaque handoff mentionne clairement **fait / bloqué / prochain owner** ;
5. aucune IA ne crée de canal parallèle ou de source de vérité concurrente.
