# Réinitialiser l'accès du compte adel4A (Loki)

> Diagnostic du 22/09/2026. Compte concerné :
> - pseudo : `adel4A`
> - `profiles.id` / `auth.users.id` : `9636c3b5-9253-447a-aaca-d88d34af1334`
> - projet Supabase : `rrhqsqzcplvmwxizqnla`

## Ce que le diagnostic a prouvé (en live, clé anon publique)

- Le profil `adel4A` existe bien, **une seule** ligne, `is_public = true`
  (donc pas de `username_conflict`).
- L'edge function `keep-username-auth` (action `login`) renvoie
  `invalid_credentials` **et non** `account_not_created` : le compte auth
  existe, possède un e-mail et n'est pas anonyme. La résolution
  pseudo → compte fonctionne.
- Le seul point qui échoue est la **vérification du mot de passe**
  (`signInWithPassword`). Autrement dit : **mot de passe qui ne correspond
  plus** (oublié / changé / désynchronisé), pas un bug de code de login.

La correction fiable est donc une **réinitialisation du mot de passe** du
compte auth, à faire côté Supabase (dashboard ou SQL) — impossible depuis
le code applicatif seul, et impossible pour l'agent sans la clé
`service_role`.

## Option A — Dashboard Supabase (recommandé, sans SQL)

1. Supabase → projet `rrhqsqzcplvmwxizqnla` → **Authentication → Users**.
2. Rechercher l'utilisateur par son **User UID**
   `9636c3b5-9253-447a-aaca-d88d34af1334`.
3. Menu `⋯` de la ligne → **Reset password** (définit un nouveau mot de
   passe directement) ou **Send recovery** si l'e-mail est réel.
4. Se reconnecter dans l'app avec le pseudo `adel4a` (la casse n'a pas
   d'importance) + le nouveau mot de passe.

> Note : si l'e-mail du compte est un e-mail interne `…@keep.local`
> (compte « pseudo seul »), le « Mot de passe oublié ? » de l'app ne peut
> PAS l'utiliser (la récupération refuse volontairement `@keep.local`).
> Dans ce cas, seule l'option A (reset admin) ou B ci-dessous fonctionne.

## Option B — SQL (éditeur SQL du dashboard)

À exécuter dans **Supabase → SQL Editor**. Remplacer
`REMPLACER_PAR_UN_MOT_DE_PASSE_FORT` par un mot de passe d'au moins 10
caractères.

```sql
-- 1) Vérifier l'état actuel du compte (e-mail réel vs @keep.local, confirmé ?)
select id, email, is_anonymous, email_confirmed_at, last_sign_in_at
from auth.users
where id = '9636c3b5-9253-447a-aaca-d88d34af1334';

-- 2) Réinitialiser le mot de passe (bcrypt, format attendu par GoTrue)
--    pgcrypto est déjà disponible sur Supabase.
update auth.users
set encrypted_password = crypt('REMPLACER_PAR_UN_MOT_DE_PASSE_FORT', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where id = '9636c3b5-9253-447a-aaca-d88d34af1334';
```

Puis se reconnecter avec le pseudo `adel4a` + le nouveau mot de passe.

### (Optionnel) Rendre « Mot de passe oublié ? » utilisable plus tard

Si le compte est en `…@keep.local` et qu'Adel veut pouvoir utiliser la
récupération par e-mail à l'avenir, lui rattacher une vraie adresse
vérifiée :

```sql
update auth.users
set email = 'adresse.reelle@exemple.com',
    email_confirmed_at = now(),
    updated_at = now()
where id = '9636c3b5-9253-447a-aaca-d88d34af1334';
```

> ⚠️ Ne jamais mettre une adresse déjà utilisée par un autre compte (unicité
> e-mail GoTrue). Vérifier avant avec :
> `select id, email from auth.users where email = 'adresse.reelle@exemple.com';`

## Limites honnêtes

- Je n'ai **pas** la clé `service_role` du projet (seule la clé anon
  publique était disponible dans le repo) : je n'ai donc **pas pu**
  exécuter la réinitialisation ni lire `auth.users`. Les commandes
  ci-dessus doivent être lancées par Adel depuis le dashboard.
- Je **ne sais pas** si l'e-mail de `adel4A` est réel ou `@keep.local` —
  la requête 1) de l'option B le dira.
