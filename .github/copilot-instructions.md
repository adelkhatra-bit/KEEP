## Canonical product library
Read `/config/keep-product-contract.json` first. It is the machine-enforced anti-regression contract. If an older test/comment/message conflicts with the user's latest explicit decision and this contract, update the stale artifact in the same commit. Never mutate live user certification/FREE/profile data to fix a UI regression.

## Mandatory product specification
Read `/docs/KEEP_MASTER_SPEC.md` — mandatory master product specification — and `/docs/KEEP_CAHIER_DES_CHARGES_UI.md` before editing. Do not move or duplicate validated modules unless the user's current request explicitly changes the specification.

# KEEP — GitHub Copilot instructions

Before changing anything, read `/BRANCH_SOURCE_OF_TRUTH.json`, `/CLAUDE.md` and `/AGENTS.md`. They are the source-of-truth rules for every AI working on KEEP.

**Branch safety:** GitHub's repository default is still `main`, so generic code-search tools can silently return stale `main` results. If a result URL/ref is `main` (or has no explicit ref), discard it and refetch the same path from `reconcile/claude-main-20260825` before reasoning or editing. The mobile application and the public website are both built from that same canonical branch.

## Mobile/Desktop parity

Treat iOS, Android and desktop Web as one product implementation. Shared product logic must be edited once under `packages/mobile/src`; Expo Web consumes that same implementation. Never create a parallel Web/Desktop feature tree or duplicate a full screen with platform suffixes to keep two copies in sync. Platform branches are allowed only for technical adapters such as microphone/audio, browser APIs, permissions and routing. Every functional change under `packages/mobile/**` must preserve both 390×844 mobile and 1440×900 desktop behavior through `.github/workflows/keep-dual-viewport-guardian.yml`. Machine contract: `config/platform-parity-contract.json`.

## One project only

- Repository: `adelkhatra-bit/KEEP`
- Working branch: `reconcile/claude-main-20260825`
- Mobile/web app: `packages/mobile`
- Super Admin: `packages/admin`
- Backend: `packages/backend`
- Music core: `packages/music`
- Supabase project: `rrhqsqzcplvmwxizqnla`
- Public site: `https://adelkhatra-bit.github.io/KEEP/`
- Public profile: `https://adelkhatra-bit.github.io/KEEP/share-profile/?u=<username>`
- Super Admin: `https://adelkhatra-bit.github.io/KEEP/admin-preview/`

Never create or deploy a second KEEP app, a temporary public HTML app, a localhost share URL, a Vercel copy, a new Supabase preview UI, or another public domain to work around routing. Fix the canonical chain instead.

Branches named `main`, `web-preview`, `admin-preview`, `chatgpt/*`, `claude-local-backup-*` and `backup/*` are not the active product source. Do not push product fixes there.

## Legacy public URLs

`supabase/functions/keep-public`, `keep-preview` and `keep-admin-preview` are compatibility redirects only. They must remain HTTP 308 redirects to the canonical GitHub Pages URLs. Never make them serve application bundles, raw GitHub branches, a second admin UI, credentials, or service-role data.

## Design lock

Unless the user explicitly requests a design change, do not modify:

- responsive layout in `packages/mobile/App.tsx`;
- `packages/mobile/src/navigation/Navigation.tsx`;
- the five-tab bar;
- the validated existing visual design.

Logic fixes must stay logic fixes.

## Before a commit

1. Search for the existing implementation before creating a file/function/table.
2. Do not invent table or route names; check the repository and live Supabase schema.
3. Run `node scripts/verify-source-of-truth.cjs`.
4. Typecheck each touched workspace.
5. For mobile/web changes, run a real export/browser test and verify no blank page.
6. For public routing, test direct link + reload + mobile browser matrix.
7. Never report PASS when a required check has not actually passed.

Never expose API secrets in `EXPO_PUBLIC_*`, client code, screenshots, logs or docs. Provider secrets stay server-side in Supabase Vault/Edge Secrets.

## 🔐 AUTHENTIFICATION — FRONTIÈRE USER / SUPER ADMIN

- **Utilisateur Loki** : runtime `packages/mobile`; récupération utilisateur = `keep-auth-email`.
- **Super Admin** : runtime `packages/admin`; autorité = `public.admin_users` + rôle actif; login principal = mot de passe Supabase; secours = `keep-admin-bootstrap` avec code à usage unique.
- Il est **interdit** de brancher le Super Admin sur `keep-auth-email`, le magic-link utilisateur ou un écran mobile de récupération.
- Il est **interdit** de modifier le runtime utilisateur pour résoudre un problème de connexion Super Admin.
- Toute IA doit vérifier `config/keep-product-contract.json > authBoundary` avant de toucher à l'authentification.
- Contrôle bloquant : `scripts/verify-source-of-truth.cjs`.
