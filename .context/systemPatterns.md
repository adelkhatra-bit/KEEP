# KEEP — Architecture et patterns durables

## Architecture globale

- Monorepo npm workspaces.
- `packages/mobile` : application utilisateur Expo pour iOS, Android et Web.
- `packages/admin` : Super Admin Next.js.
- `packages/backend` : API Node.js/Express.
- `packages/music` : moteur musical partagé et indépendant des fournisseurs.
- `supabase` : Auth, PostgreSQL, Storage, Edge Functions et migrations.
- Déploiement web public unique : `.github/workflows/web-preview-pages.yml` vers GitHub Pages.

## Patterns React Native et Supabase

- Les écrans composent l'interface ; la logique métier réutilisable vit dans `src/services`.
- L'état client partagé utilise des stores Zustand nommés `useXStore`.
- Les intégrations musicales passent par les abstractions de `@keep/music`, pas directement depuis les écrans.
- Les opérations sensibles (crédits, droits, écritures privilégiées) sont validées côté Supabase/Edge Function. Un précontrôle client n'est jamais l'unique barrière.
- Les écritures doivent être idempotentes quand l'action peut être rejouée.
- Les migrations SQL datées sont la source de vérité du schéma ; ne jamais inventer une table à partir d'un ancien document.
- Tables canoniques courantes : `profiles`, `keep_decisions`, `subscriptions`, `plans`, `social_links`, `playlists`, `follows`.
- Les invités restent locaux et stables ; un essai ne doit pas créer de comptes Auth au rafraîchissement.
- Les secrets restent côté serveur. Seules les variables explicitement publiques portent le préfixe `EXPO_PUBLIC_` ou `NEXT_PUBLIC_`.

## Conventions de code

- Composants et écrans React : `PascalCase.tsx`.
- Fonctions, variables et services : `camelCase` ; services généralement nommés `xService.ts`.
- Hooks/stores : préfixe `use` (`useUserStore`, `useSessionStore`).
- Types et interfaces : `PascalCase` ; constantes globales : `UPPER_SNAKE_CASE`.
- Migrations : préfixe horodaté suivi d'un nom descriptif en snake_case.
- Variables d'environnement : `UPPER_SNAKE_CASE`, sans valeur secrète dans la documentation.
- Commenter la raison produit ou la contrainte de sécurité, pas paraphraser le code.

## Décisions architecturales

- Une seule branche active, une seule application mobile/web et une seule URL publique canonique.
- Les anciennes routes ne servent que de redirections ; aucune interface parallèle.
- Le responsive desktop doit rester dans l'application Expo/React Native Web existante avec des composants/layouts adaptés aux breakpoints. Pas de deuxième frontend utilisateur.
- Le design courant, `App.tsx`, `Navigation.tsx` et la barre des cinq onglets sont verrouillés sans accord explicite d'Adel.
- Loki Swipe utilise un lecteur d'extrait partagé : une seule lecture active, arrêt au changement de carte et repli manuel lorsque l'autoplay est refusé.
- Apple Music et les autres sessions fournisseurs doivent être rattachés à l'identité KEEP courante, jamais partagés implicitement entre profils.
- Règles crédit courantes : écouter/reconnaître/PASS = 0 ; GARDER depuis Écouter = coût serveur configurable (3 actuellement) ; copie sociale = 0.
- La PWA est une amélioration de distribution distincte du responsive : commencer par l'expérience desktop, ajouter l'installabilité ensuite si utile.

## Priorité des sources

1. Code, migrations et schéma Supabase déployé.
2. `CLAUDE.md` et `AGENTS.md`.
3. `docs/KEEP_MASTER_SPEC.md` et `docs/KEEP_DECISIONS.md` après confrontation au code actuel.
4. `.context/` pour l'état partagé récent.
