# KEEP — Matrice de déblocage des plateformes externes

Objectif : aider les agents à exploiter **au maximum** GitHub et les plateformes connectées **sans perdre le contrôle** ni contourner la validation humaine nécessaire.

## Règle d'or

Un agent peut :

- auditer ;
- documenter ;
- préparer ;
- vérifier en lecture seule ;
- déclencher des workflows ou tests déjà autorisés ;
- pointer précisément ce qui manque.

Un agent ne peut pas, seul, inventer ou récupérer un secret absent, ni s'accorder de nouvelles permissions sur une plateforme externe.

## Tableau de déblocage

| Plateforme | Ce que les agents peuvent faire | Ce qui bloque / exige Adel | Preuve / canal canonique |
|---|---|---|---|
| GitHub repository | Gérer issues/PRs, labels, workflows, reviews, artifacts, docs, triage | Branch protection, default branch, apps GitHub, permissions repo/org | GitHub Issues, PRs, Actions, labels |
| GitHub Actions | Lire logs, relancer workflows, corriger YAML/scripts, publier artifacts | Secrets GitHub manquants, permissions `workflows`, runners/org settings | URLs de runs, jobs, artifacts |
| GitHub Pages | Corriger export, routage SPA, workflow `web-preview-pages.yml` | Settings Pages si cassés côté dépôt/org | run Pages + URL publique canonique |
| Supabase | Auditer code, fonctions edge, RLS, clients, docs, flows Auth | Secrets Vault/Edge absents, droits dashboard, changements prod sensibles | code + migrations + fonctions + rapports |
| Vercel | Auditer config repo, pointer la bonne branche, préparer corrections | Changer Production Branch, tokens Vercel, permissions projet | doc d'action humaine + build/redeploy |
| Expo / EAS | Corriger config build/submit, analyser logs, relancer builds | EXPO_TOKEN/credentials Apple manquants ou invalides | workflows `auto-eas-build.yml`, `app-store-native-preflight.yml` |
| Apple / App Store Connect | Diagnostiquer profils, entitlements, API 401/403, adapter workflows | API key, certificats, capabilities, permissions Apple réelles | logs build iOS + doc de remediation |
| Stripe | Auditer intégration et noms de secrets, vérifier code serveur/client | vraie `sk_live_*`, réglages dashboard, webhooks réels | Super Admin + docs ops |
| ChatGPT relay | Maintenir le relais canonique, schéma OpenAPI, miroirs de consignes | Coller/générer la clé `AI_RELAY_API_KEY`, autoriser l'action côté ChatGPT | `AI/AI_INSTRUCTIONS.md`, `AI/AI_REPORT.md` |
| Notion / Slack / Sentry / autres | Auditer présence/absence, documenter gaps, préparer endpoints utiles | OAuth/apps/tokens/permissions réels | audit et matrice d'intégration |

## Procédure de déblocage sans perte de contrôle

1. **Auditer l'état réel** : workflow, logs, code, config, labels, doc, run URLs.
2. **Classer le blocage** :
   - blocage technique corrigeable dans le dépôt ;
   - blocage d'accès/secret/permission nécessitant Adel ;
   - blocage mixte.
3. **Corriger tout ce qui est corrigeable par code** avant de demander une action humaine.
4. **Réduire la demande humaine au strict minimum** : une permission, une clé, un clic, une branche, un redeploy.
5. **Revenir avec une preuve GitHub** : run vert, artifact, capture, log, PR.

## Demandes humaines minimales typiques

### GitHub
- changer la branche par défaut ;
- installer/supprimer une GitHub App ;
- modifier une ruleset ou une protection de branche.

### Vercel
- pointer la Production Branch vers `reconcile/claude-main-20260825` ;
- redeployer un projet après correction dépôt.

### Supabase
- créer/corriger un secret Vault/Edge ;
- approuver un changement prod sensible non automatisable.

### Apple
- régénérer/autoriser une clé ASC ;
- valider les capabilities/certificats côté compte Apple.

### Stripe
- coller la vraie `sk_live_*` ;
- valider un webhook ou une permission dashboard.

## Résultat visé

Le système est "déverrouillé" quand :

- GitHub reste le poste de commandement unique ;
- les agents corrigent tout ce qui est automatisable dans le dépôt ;
- Adel n'intervient plus que sur les **verrous de plateforme** impossibles à déléguer proprement ;
- chaque déblocage humain débouche immédiatement sur une preuve GitHub vérifiable.
