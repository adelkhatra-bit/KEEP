# P5 — Branche par défaut GitHub + diagnostic keep-preview

_Auteur : Abacus Agent — 2026-09-22._

## A. Changer la branche par défaut vers `reconcile/claude-main-20260825`

**État actuel (vérifié via API GitHub) : `default_branch = main`.** Or tout le travail est sur
`reconcile/claude-main-20260825`. C'est **la cause racine** du keep-preview rouge (voir §B).

### Étapes exactes (à faire par Adel — l'UI ne peut pas être automatisée ici)
1. Aller sur **https://github.com/adelkhatra-bit/KEEP/settings/branches**
2. Section **« Default branch »** → cliquer l'icône **⇄ (switch)** à droite de `main`.
3. Dans la liste déroulante, choisir **`reconcile/claude-main-20260825`**.
4. Cliquer **« Update »** puis confirmer **« I understand, update the default branch »**.

> Impact : les nouvelles PR/clones pointeront sur `reconcile/...`. **Aucune donnée perdue** : `main`
> reste intacte. Réversible à tout moment par la même manip.

### ⚠️ Après le changement — 2 vérifications
- **Vercel** : Project → Settings → **Git → Production Branch** doit aussi être mis à
  `reconcile/claude-main-20260825` (Vercel ne suit pas automatiquement le défaut GitHub). C'est le
  point clé qui rend keep-preview vert (§B).
- **Branch protection** : si une règle protège `main`, en ajouter une équivalente sur `reconcile/...`
  (Settings → Branches → Add rule).

## B. Diagnostic keep-preview

### Ce qui a été testé EN DIRECT (tout est SAIN)
| Test | Résultat |
|---|---|
| GitHub Pages canonical `https://adelkhatra-bit.github.io/KEEP/` | **HTTP 200** ✅ |
| Fonction Supabase `keep-preview` (redirection) | **HTTP 308 → …github.io/KEEP/** ✅ |
| `keep-preview?u=keep-smoke` (partage profil) | **HTTP 308 → …/share-profile/?u=keep-smoke** ✅ |
| Build Vercel reproduit en local sur HEAD (`expo export --platform web` + `fix-web-export.cjs`) | **exit 0, `dist/` généré** ✅ |

Précision importante : **`keep-preview` n'est pas un projet Vercel** au sens applicatif — c'est une
**fonction edge Supabase** (`supabase/functions/keep-preview/index.ts`), simple pont de compatibilité
308 vers GitHub Pages. Elle fonctionne. Le code respecte les checks `verify-source-of-truth`
(canonical + 308 + pas de bundle stale/service-role).

### Pourquoi c'est rouge sur Vercel (cause probable)
Le projet **Vercel** rattaché au repo build l'export web Expo (racine `vercel.json` :
`expo export --platform web`, `EXPO_PUBLIC_KEEP_PREVIEW=1`). Sa **Production Branch pointe très
probablement sur `main`** (= le défaut GitHub actuel), qui est **en retard de ~140 commits** et
contenait l'état de build cassé (les 15 erreurs corrigées par `4f56cbd`). → build rouge.

Sur `reconcile/claude-main-20260825` (HEAD actuel) le build est **vert en local** (prouvé ci-dessus).

### Réparation (2 options, la 1 suffit en général)
1. **Aligner Vercel sur la bonne branche** : Vercel → Project → Settings → **Git → Production Branch**
   = `reconcile/claude-main-20260825`, puis **Redeploy**. Le build passera au vert (validé en local).
2. Faire le §A (changer le défaut GitHub) **et** l'étape Vercel du §A. Même effet, plus cohérent
   long terme.

Si après ré-alignement sur `reconcile/...` le build Vercel reste rouge, m'envoyer le **log de build
Vercel** (Deployments → le déploiement rouge → « Building ») : je n'ai pas accès au dashboard Vercel,
mais avec le log je cible l'erreur exacte. À ce stade, tout ce qui est vérifiable côté repo est vert.
