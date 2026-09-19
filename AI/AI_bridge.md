# AI Bridge — état Claude Code (keep-2d)

Dernière mise à jour : 2026-09-20, session continue depuis le 15/09.
Branche : `reconcile/claude-main-20260825`. Dernier commit poussé : `e30ccf6`.

## État actuel — tout est VERT

- **Site web public** (`web-preview-pages.yml`, run #1030) : ✅ succès, sur `a17c900`.
- **CI complète** (`full-stack-ci.yml`) : ✅ devrait passer maintenant (dernier échec corrigé, faux positif de script CI).
- **Build iOS macOS/TestFlight** (`auto-eas-build.yml`, run #15) : ✅ a déjà réussi le 19/09 12h27 — build compilé ET soumis à TestFlight avec succès.
- **Typecheck** mobile/admin/backend : ✅ propre.

## Commandes utilisées cette session (pour référence, reproductibles)

```
npx tsc -p packages/mobile/tsconfig.json --noEmit
npx tsc -p packages/admin/tsconfig.json --noEmit
npx tsc -p packages/backend/tsconfig.json --noEmit
node scripts/verify-admin-user-loop.cjs
node scripts/verify-push-direct-supabase.cjs
git fetch origin reconcile/claude-main-20260825
git merge origin/reconcile/claude-main-20260825 --no-edit   # pour reconcilier une divergence, jamais de reset --hard
```

Déclenchement build iOS (macOS gratuit, plus de quota EAS Cloud consommé) :
```
gh workflow run auto-eas-build.yml --repo adelkhatra-bit/KEEP --ref reconcile/claude-main-20260825 -f profile=production
```

## Corrections faites aujourd'hui (commits `fe52e17` → `e30ccf6`)

1. `@keep/music` manquant dans `packages/mobile/package.json` (cassait tous les builds).
2. Runner iOS passé de `ubuntu-latest`/EAS Cloud (quota épuisé) à `macos-latest`/`eas build --local` (gratuit, dépôt public).
3. Erreur de syntaxe (guillemets) dans `ProfileSettingsMobileScreen.tsx`.
4. Bug d'exécution réel dans `KeepBattleMobileGameV3.tsx` (`'error' in undefined` à chaque Battle Solo réussi).
5. Faux positif CI dans `verify-admin-user-loop.cjs` (script pas à jour après le refactor `invokeAdminFunction`).

## Ce qui bloque encore (décision d'Adel requise, rien touché)

- **`packages/mobile/app.json`** : corrompu en local, non commité (accents français cassés en mojibake, `useFrameworks: static` disparu). À restaurer ou nettoyer — pas encore fait, en attente de confirmation.
- **Migration `pnpm`** : fichiers `pnpm-lock.yaml`/`pnpm-workspace.yaml` présents mais non commités, `package-lock.json` supprimé en local seulement. Inachevée.
- **Brevo** : expéditeur `lokicontactadmin@gmail.com` toujours non vérifié, et même vérifié, aucun domaine authentifié (SPF/DKIM) → risque spam Gmail/Yahoo/Outlook.
- **Stripe** : `STRIPE_PUBLISHABLE_KEY`, prix réels (`stripe_price_id`), et webhook secret toujours à faire (non prioritaire selon Adel).

## Pour prendre le relais

Le point d'entrée le plus sûr : lire ce fichier + `AGENT_MESSAGES.md` (journal chronologique détaillé) avant toute action. Ne jamais `git push --force` ni `git reset --hard` sur cette branche. Secrets/clés : jamais saisis par une IA dans un champ, même avec l'accord d'Adel — uniquement par lui, dans Super Admin ou GitHub Secrets.
