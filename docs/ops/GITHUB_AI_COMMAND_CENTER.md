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
- GitHub Pages ;
- CodeQL ;
- Dependabot ;
- artifacts ;
- templates + CODEOWNERS ;
- relais IA ;
- triage automatique des issues ;
- triggers `workflow_dispatch` / `schedule` ;
- build iOS local gratuit sur runners macOS GitHub publics.

## Définition du “100% coordination”

Le système est considéré complet quand :

1. chaque demande significative a une issue ou une trace dans `AGENT_MESSAGES.md` ;
2. chaque issue possède un commentaire de routage unique et à jour ;
3. chaque agent prend un verrou avant édition ;
4. chaque handoff mentionne clairement **fait / bloqué / prochain owner** ;
5. aucune IA ne crée de canal parallèle ou de source de vérité concurrente.
