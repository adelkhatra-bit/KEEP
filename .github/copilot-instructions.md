# KEEP — GitHub Copilot instructions

Before changing anything, read `/CLAUDE.md` and `/AGENTS.md`. They are the source-of-truth rules for every AI working on KEEP.

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
