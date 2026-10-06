# KEEP — Poste de commandement agents

Source opérationnelle unique pour coordonner Claude Code, Codex/ChatGPT et les automatisations GitHub sans créer une deuxième version du projet.

## Branche et protections
- Branche unique de travail : `reconcile/claude-main-20260825`.
- Ne jamais modifier directement `main`.
- Ne pas toucher à `packages/mobile/App.tsx` pour le responsive, `Navigation.tsx`, la barre des 5 onglets, `ProfileScreen.BACKUP.tsx` ni au design validé sans demande explicite.
- Lire `AGENTS.md`, `PROJECT_STATE.md`, `.context/activeContext.md`, `docs/ERROR_LEDGER.md` et `AGENT_MESSAGES.md` avant une tâche significative.

## États autorisés
`LOCAL_ONLY` → `COMMITTED_LOCAL` → `PUSHED_REMOTE` → `TESTED_REMOTE` → `DEPLOYED`.
Aucun agent ne doit annoncer un état supérieur sans preuve réelle.

## Triage
Le workflow `.github/workflows/agent-command-triage.yml` contrôle automatiquement la branche, les fichiers protégés, les marqueurs de conflit et la présence des sources de vérité. Sa configuration est `.github/agent-command-center.json`.

## Coordination
Utiliser le verrou existant `scripts/agent-lock.cjs` et le journal `AGENT_MESSAGES.md`. Ne pas créer de second relais : le relais canonique reste `keep-ai-relay` / `public.ai_relay_messages`.

## Sortie attendue d'un agent
SHA, CI réelle, test mobile 390×844 si UI mobile touchée, éléments testés, erreurs restantes.