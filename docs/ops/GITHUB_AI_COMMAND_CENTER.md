# KEEP — Poste de commandement GitHub-native pour agents IA

Ce document fixe l'organisation opérationnelle de KEEP pour exploiter GitHub au maximum de la gratuité **sans perdre le contrôle**.

## 1. Hub unique

GitHub est le hub canonique pour :

- le code et l'historique Git ;
- les issues de travail ;
- les pull requests et leurs preuves ;
- les workflows GitHub Actions ;
- les artifacts de build et de diagnostic ;
- les labels de pilotage ;
- les commentaires/reviews qui actent les décisions.

Le relais canonique ChatGPT ↔ Claude Code reste `keep-ai-relay` / `public.ai_relay_messages`, avec miroir documentaire dans `AI/AI_INSTRUCTIONS.md` et `AI/AI_REPORT.md`.

Aucun second relais, aucun deuxième journal parallèle, aucune deuxième chaîne de décision ne doit être créée.

## 2. Rôles IA autorisés

### ChatGPT
- cadrage du besoin ;
- découpage des tâches ;
- reformulation produit ;
- préparation d'instructions structurées ;
- lecture de la documentation et des retours consolidés.

### Claude Code / Codex
- audit du dépôt ;
- diagnostic CI/CD ;
- corrections et implémentations ;
- validation technique ;
- mise à jour du journal inter-agents.

### GitHub Copilot cloud agent
- exécution de tâches ciblées liées à une issue ou une PR ;
- corrections localisées ;
- relance et lecture de workflows GitHub ;
- support de triage sur changements isolés.

### Claude Design
- UX/UI, hiérarchie visuelle, wording, structure d'écran ;
- jamais source de vérité pour le code, la base, les secrets, les workflows ou l'infrastructure.

## 3. Matrice d'accès minimale

| Rôle | Lecture dépôt | Écriture code | Déclenchement workflows | Lecture artifacts | Secrets |
|---|---|---|---|---|---|
| ChatGPT | Oui, via relais/documentation | Non | Non | Résumés humains seulement | Jamais |
| Claude Code / Codex | Oui | Oui, uniquement via branche dédiée + PR | Oui, si nécessaire à la tâche | Oui | Jamais en clair |
| GitHub Copilot cloud agent | Oui | Oui, sur branche/PR de tâche | Oui, dans le périmètre GitHub | Oui | Jamais en clair |
| Claude Design | Journal/documentation seulement | Non | Non | Non | Jamais |
| Humain mainteneur | Oui | Oui | Oui | Oui | Validation manuelle requise |

Règles absolues :

- aucun agent ne reçoit une clé longue durée si un workflow GitHub, un token court ou une GitHub App suffit ;
- aucun secret ne doit être copié dans une issue, une PR, un artifact, un log ou un fichier versionné ;
- toute écriture de code passe par une branche dédiée et une PR vérifiable.

## 4. Routage des tâches

Une tâche = une issue.
Une issue = un agent principal responsable.
Une PR = une unité de travail vérifiable.

### Types de tâches
- `bug` : défaut produit ou régression ;
- `ci` : panne workflow, build, tests, runner, sécurité pipeline ;
- `design` : structuration UX/UI sans vérité infra ;
- `security` : revue sécurité, exposition de secrets, permissions, surface d'attaque ;
- `release` : préflight, build natif, publication, artifacts, readiness ;
- `audit` : inventaire, contrôle, documentation, conformité, exploitation des plateformes.

### Labels agents
- `chatgpt`
- `claude`
- `codex`
- `copilot`
- `agent-task` (coordination transversale)

## 5. Workflows GitHub comme gardes

Les preuves doivent revenir dans la PR, pas dans un canal externe isolé.

Exemples de workflows KEEP à utiliser selon le type de tâche :

- `bug` : `mobile-ci.yml`, `full-stack-ci.yml`, `keep-human-guardian.yml`, `keep-dual-viewport-guardian.yml`
- `ci` : `full-stack-ci.yml`, `mobile-web-importmeta-diagnostic.yml`, `codeql.yml`, `verify-migrations.yml`, `auto-eas-build.yml`
- `design` : workflows de preuve web/mobile concernés + captures/artifacts
- `security` : `codeql.yml`, `loki-security-guard.yml`
- `release` : `app-store-native-preflight.yml`, `auto-eas-build.yml`, `web-preview-pages.yml`, `eas-update-production.yml`
- `audit` : workflows de contrôle ou inventaires associés au périmètre

## 6. Procédure standard

1. Ouvrir une issue via le template adapté.
2. Appliquer **un label de type** et **un label d'agent principal**.
3. Définir le périmètre, les fichiers interdits et les validations requises.
4. Travailler sur une branche dédiée et ouvrir une PR.
5. Laisser GitHub Actions produire les preuves : logs, checks, artifacts, captures.
6. Reporter les résultats dans la PR et, si nécessaire, dans `AGENT_MESSAGES.md`.

## 7. Actions réservées à l'humain

Restent explicitement manuelles :

- installation/suppression d'apps GitHub ;
- création, rotation, révocation de secrets ;
- validation des permissions externes (GitHub, Supabase, Apple, Stripe, Vercel, etc.) ;
- modifications de branch protection, rulesets, environments et reviewers obligatoires ;
- toute ouverture d'accès supplémentaire à une IA externe.

## 8. Ce que KEEP doit éviter

- dupliquer la coordination dans plusieurs canaux non synchronisés ;
- donner des accès globaux indistincts à plusieurs IA ;
- contourner GitHub pour les preuves de build/test/review ;
- créer un second site, une seconde app ou une seconde chaîne de publication pour "aider" un agent.

## 9. Livrables de cette mise en place

Cette implémentation doit rester visible dans le dépôt via :

- des templates d'issues orientés agents ;
- un template de PR imposant les preuves et validations ;
- une configuration machine-readable des rôles, canaux et accès minimaux ;
- des labels GitHub normalisés pour le pilotage.
