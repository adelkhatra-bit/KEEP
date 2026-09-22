# P4 — Réduction des workflows GitHub Actions

_Auteur : Abacus Agent — 2026-09-22. Livrable = proposition + liste. **Aucune suppression appliquée** (GO requis)._

## État actuel

**65 workflows** dans `.github/workflows/`. Dont **43 jetables** (suffixe `-once` / préfixe `one-time-` /
`one-shot-`) = correctifs ponctuels déjà exécutés, qui ne servent plus qu'à polluer l'onglet Actions
et à consommer des minutes. Restent **22 workflows** actifs, dont beaucoup se **chevauchent**
(plusieurs se déclenchent sur `packages/mobile/**` et refont un lint/tsc/jest partiel).

## 1. Les 43 workflows jetables à SUPPRIMER

_(liste aussi dans `docs/ci/p4_jetables.txt`)_

Tous les `keep-battle-*-once.yml` (correctifs battle ponctuels), plus :
`admin-users-live-directory-once`, `discover-immediate-profiles-once`,
`keep-global-discovery-admin-guardian-once`, `keep-push-direct-supabase-once`,
`mobile-listen-audit-once`, `mobile-safari-mic-fix-once`, `mobile-samsung-reliability-once`,
`profile-deeplink-referral-audit-once`, `profile-real-browser-tab-contract-once`,
`shared-profile-follow-unblock-once`, `one-shot-integrity-release`,
`one-time-battle-offers-system`, `one-time-lock-sync`, `one-time-mobile-clarity-v2`,
`one-time-profile-vibes-v2`.

→ Ce sont des **workflows CI**, pas des fonctionnalités de l'app : les supprimer ne retire aucun
bouton/état/modale. Réversible via git.

## 2. Les 22 restants — regroupement

| Catégorie | Workflows actuels | Devenir |
|---|---|---|
| **CI qualité** (lint/tsc/jest/verify) qui se chevauchent | `full-stack-ci`, `mobile-ci`, `keep-human-guardian`, `keep-dual-viewport-guardian`, `keep-battle-solo-guardian`, `loki-security-guard`, `data-preservation`, `delete-track-e2e`, `public-trial-smoke`, `keyless-recognition-live`, `mobile-web-importmeta-diagnostic`, `verify-migrations` | **→ fusionner en 1 seul `ci.yml`** (jobs à filtres de chemin) |
| **Sécurité** | `codeql` | garder tel quel (standard GitHub) |
| **OTA** (JS/TS runtime) | `eas-update-production` | garder → **branche OTA du pipeline** |
| **Build natif** (version/config) | `eas-build-ios`, `android-preview-apk`, `app-store-native-preflight`, `auto-eas-build`, `multi-agent-merge-build` | **→ 1 `native-build.yml`** (dispatch + push config native) |
| **Web preview** | `web-preview-pages` | garder |
| **Deploy edge** | `deploy-keep-ai-relay` | garder (déclenché sur son dossier) |
| **Cron** | `email-queue-retry` | garder (planifié) |

⚠️ `eas-build-ios` était noté **obsolète (erreur Apple 401)** dans l'audit précédent → à réparer ou
retirer lors de la fusion native (voir P5 pour la partie build).

## 3. Pipeline unique proposé

Décision automatique **sur push** vers `reconcile/claude-main-20260825`, par chemins modifiés :

```
push
 ├─ CI (ci.yml) : toujours → install + tsc + jest + verify-source-of-truth + verify-migrations
 │     (jobs conditionnés par paths pour ne lancer que le nécessaire)
 │
 ├─ Si SEUL du JS/TS runtime a changé
 │     (packages/mobile/src/**, packages/music/**, assets JS)
 │        → OTA : eas update --branch production   (PAS de build natif)
 │
 └─ Si config native / version a changé
       (packages/mobile/app.json, eas.json, modules/**, package.json, package-lock.json,
        bump de version)
          → BUILD natif iOS (+ Android preview) via EAS
```

Règle simple : **JS pur = OTA seulement ; natif/version = build**. C'est exactement la demande d'Adel.

### Bénéfices chiffrés
- **65 → ~9 workflows** (`ci`, `codeql`, `eas-update-production`, `native-build`, `web-preview-pages`,
  `deploy-keep-ai-relay`, `email-queue-retry`, + éventuellement `verify-migrations` si non fusionné).
- **-43** fichiers jetables + **~11** workflows CI fusionnés → onglet Actions lisible, moins de minutes
  consommées, plus de builds natifs déclenchés par erreur sur un simple changement JS.

## 4. Exécution (après GO)

Suppression des 43 jetables (réversible) :
```bash
cd .github/workflows
xargs -a docs/ci/p4_jetables.txt rm -v   # chemin relatif à adapter
git commit -m "chore(ci): supprimer 43 workflows jetables (once/one-time/one-shot)"
```

Puis je livrerai `ci.yml` + `native-build.yml` unifiés (code réel + tests verts) sur ta validation.

> **Rien n'est supprimé pour l'instant.** Proposition en attente du GO d'Adel.
