# INDEX — Loki Music

> Point d'entrée unique pour **n'importe quel dev ou IA**. But : tout retrouver, ne rien oublier.
> Chemins vérifiés le 24/09/2026 sur la branche `reconcile/claude-main-20260825`.
> Ce fichier est un **carrefour** : il ne remplace pas les règles de `CLAUDE.md` / `AGENTS.md`, il y renvoie.

## 📖 À lire EN PREMIER (dans l'ordre)
1. `CLAUDE.md` (racine) — protocole complet : audit avant toute tâche, jamais de doublon, jamais de PASS sans preuve.
2. `AGENTS.md` (racine) — coordination multi-agents + verrou de travail réel.
3. `PROJECT_STATE.md` (racine) — tableau de bord unique (état git, fonctionnalités, points ouverts).
4. `.context/activeContext.md` — où on en est maintenant (mémoire de travail entre agents).
5. `README.md` (racine) — architecture monorepo + « ce qui est testé vs codé vs mock ».

## 🔑 Clés & Identifiants (identifiants uniquement, JAMAIS les secrets)
| Clé | Valeur | Où la trouver |
|---|---|---|
| APPLE_TEAM_ID | `WTG9399DBK` | `packages/mobile/eas.json` |
| ASC_APP_ID | `6812393589` | `packages/mobile/eas.json` |
| ASC_ISSUER_ID | `bf75c204-8876-4c83-a84a-52b7e7a5b2c3` | App Store Connect + `AI_COLLABORATION.md` |
| ASC_KEY_ID | `TYJC8LTGVF` (Loki1) · `ZSQ7JV3HN6` (Loki) · `FS8Q659B6Q` | App Store Connect → Users and Access → Integrations |
| SUPABASE_URL | `https://rrhqsqzcplvmwxizqnla.supabase.co` | `.env` / `packages/backend/.env.example` |
| GITHUB_REPO | `adelkhatra-bit/KEEP` | — |
| BRANCH | `reconcile/claude-main-20260825` | — |

> ⚠️ Le fichier `.p8` (contenu de la clé ASC) n'est téléchargeable **qu'une seule fois** à la création — il n'est **jamais** dans le repo ni Supabase. Seuls les identifiants ci-dessus le sont.

## 📁 Fichiers clés du projet (chemins vérifiés)
| Sujet | Rôle | Chemin exact |
|---|---|---|
| Design System (tokens) | Couleurs officielles | `packages/mobile/src/theme/colors.ts` |
| Design System (doc) | Charte écrite | `DESIGN_SYSTEM.md` · `docs/UI_CONTRAST_RULE.md` |
| Écran écoute | « Écouter » (garder/passer) | `packages/mobile/src/screens/HomeScreenCompact.tsx` |
| Profil propriétaire | Mon profil public | `packages/mobile/src/screens/ProfilePublicScreen.tsx` |
| Profil visiteur | Profil d'un autre | `packages/mobile/src/screens/PublicUserProfileScreen.tsx` |
| Playlists / bibliothèque | « Ma Musique » | `packages/mobile/src/screens/MyMusicScreen.tsx` |
| Soirées + Battle | « Soirées » | `packages/mobile/src/screens/PartiesScreen.tsx` |
| Offres / abonnements | Plans & crédits | `packages/mobile/src/screens/OffersScreen.tsx` |
| Cœur métier musical | Provider-agnostic | `packages/music/` |
| Backend | Node/Express + Supabase | `packages/backend/` |
| Admin | Super Admin Next.js | `packages/admin/pages/` |
| Maquettes HTML | Avant tout code visuel | `docs/mockups/*.html` |
| Migrations DB | SQL Supabase | `supabase/migrations/` |

## 🍎 App Store (tout est ici)
| Sujet | Chemin |
|---|---|
| **PUBLIER (guide vocal A/B, sans .p8)** | `docs/APP_STORE_VOCAL_GUIDE.md` |
| **Automatisation Fastlane (fiche + soumission)** | `packages/mobile/fastlane/` + `scripts/publish-app-store.sh` |
| Textes fiche (description, mots-clés, URLs, copyright) — **prêts à coller** | `docs/APP_STORE_SUBMISSION_READY.md` |
| Checklist soumission | `APP_STORE_CHECKLIST.md` |
| Notes App Review | `APP_STORE_REVIEW_NOTES.md` |
| Readiness détaillée 2026 | `docs/APP_STORE_RELEASE_READINESS_2026.md` |
| Déploiement TestFlight | `docs/DEPLOYMENT_TESTFLIGHT.md` |
| Conformité plateformes (Apple/Spotify/Google) | `docs/PLATFORM_COMPLIANCE.md` |
| Vérif automatique (75/75) | `node scripts/verify-app-store-readiness.cjs` |

## 🔧 Correctifs CI livrés en patch (permission `workflows` requise)
> Le connecteur GitHub ne peut pas pousser `.github/workflows/**` (permission « Workflows » absente).
> Ces correctifs sont donc livrés en `.patch` sous `docs/ci/` (même convention que `ota-path-filter.patch`).
> Pour les appliquer : `git apply docs/ci/<nom>.patch` puis commit/push par un compte ayant la permission.

| Patch | Rôle |
|---|---|
| `docs/ci/e2e-playlists-profile-stabilize.patch` | Stabilise la navigation Playlists→Profil après suppression (clic « Profil » fiabilisé + libellés « Loki Music ») |
| `docs/ci/e2e-route-after-reload.patch` | Vérifie la route après reload sur GitHub Pages (/Main/Profile, /Main/Parties, /Main/MyMusic) |
| `docs/ci/app-store-submit-workflow.patch` | Workflow `app-store-submit.yml` : soumission fiche + review via clé API ASC (100% autonome) |
| `docs/ci/ota-path-filter.patch` | (existant) Élargit le filtre de chemins OTA |

## 👤 Actions humaines (ce que seul Adel peut faire)
- `docs/ADEL_ACTIONS.md` — liste des actions manuelles minimales (quota EAS, permissions Apple/GitHub, Stripe live, IAP/MusicKit, branche par défaut, Vercel) avec lien direct, texte vocal exact et résultat attendu.

## 🧭 Mémoire & journaux (communication entre IAs)
| Fichier | Rôle |
|---|---|
| `PROJECT_STATE.md` | État global du projet |
| `AGENT_MESSAGES.md` | Journal des missions |
| `.context/activeContext.md` | État de travail courant |
| `.context/systemPatterns.md` · `.context/techContext.md` | Patterns & contexte technique |
| `AI/AI_INSTRUCTIONS.md` · `AI/AI_REPORT.md` · `AI/AI_bridge.md` · `AI_COLLABORATION.md` | Coordination inter-agents |
| `docs/RESTE_A_FAIRE.md` · `docs/PROJECT_STATUS.md` | Reste à faire / statut honnête |

## 🎨 Design System (rappel rapide)
- Violet action : `#7C5CFC`
- Menthe succès / GARDER : `#2DE1C2`
- Corail danger / PASSER : `#FF5C72`
- Fond : `#0B0A12` · Fond élevé : `#151320` · Fond carte : `#1C1930` · Bordure : `#2A2640`

## 🚀 Commandes essentielles
- Tests : `npm test --workspaces --if-present` (⚠️ jamais `npx jest` à la racine — erreurs babel)
- Typecheck : `npx tsc --noEmit -p packages/mobile`
- Vérif source de vérité : `node scripts/verify-source-of-truth.cjs`
- Vérif App Store : `node scripts/verify-app-store-readiness.cjs`
- Build iOS : `gh workflow run auto-eas-build.yml` OU push sur `packages/mobile/**`
- Trigger build : créer `packages/mobile/.eas-build-trigger` puis push

## 📋 Fichiers interdits sans validation explicite
- `packages/mobile/src/navigation/Navigation.tsx`
- `packages/mobile/App.tsx`
- `packages/mobile/src/config/brand.ts`
- Identifiants techniques : `keep_*`, `keep://`, `KeepBattleDecision`

## 🎯 Règles absolues
1. Rien ne disparaît (aucune fonction/bouton/état/modale supprimé — restyling ou ajout seulement)
2. Maquette HTML avant code pour toute refonte visuelle
3. Tokens `colors.ts` uniquement (jamais de couleur en dur)
4. « Loki Music » partout dans l'interface
5. Un commit par sujet
6. Tests verts avant push (`tsc` + `jest` + `verify-source-of-truth`)
7. Audit avant code (chercher les doublons existants d'abord)

## 🔐 Secrets (où ils SONT, jamais leur contenu)
- **GitHub Secrets** : `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8_BASE64`, `APPLE_TEAM_ID`, `ASC_APP_ID`, `EXPO_TOKEN` — utilisés par `.github/workflows/auto-eas-build.yml` et `eas-build-ios.yml`.
- **Supabase `integration_secrets`** : ACRCloud, Spotify, YouTube, Brevo, Stripe, AI relay, Pipedream (17 entrées).
- **Le `.p8` App Store** : à télécharger UNE seule fois à la création de la clé (jamais dans le repo).
