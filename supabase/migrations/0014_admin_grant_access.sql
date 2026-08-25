-- KEEP — 0014: accès offert par Super Admin (cf. demande explicite du
-- 24/08/2026 -- "je dois pouvoir depuis le Super Admin donner un accès
-- spécial SANS paiement... utilise le système Plans/Entitlements/
-- Subscription existant... subscription_source = admin_grant/promotional").
--
-- N'ajoute PAS une deuxième logique "if VIP" : réutilise `subscriptions`
-- (0003_commerce.sql) telle quelle, avec 3 colonnes de traçabilité en plus.
-- `plan_price_id`/`channel`/`country_code`/`currency_code` restent NOT NULL
-- (schéma existant, jamais modifié) -- un accès offert pointe simplement
-- vers le prix réel du plan concerné (aucune charge réelle n'est jamais
-- déclenchée par une ligne `subscriptions`, quel que soit `channel`).

alter table subscriptions add column if not exists source text not null default 'purchase'
  check (source in ('purchase', 'admin_grant', 'promotional'));
alter table subscriptions add column if not exists granted_by uuid references admin_users(id);
alter table subscriptions add column if not exists grant_reason text;

comment on column subscriptions.source is 'purchase = paiement réel ; admin_grant/promotional = accès offert par Super Admin, mêmes entitlements que le plan, jamais une logique parallèle.';

-- `admin_users` est verrouillée "none" (0006_rls.sql, aucun accès direct même
-- en lecture) -- une fonction SECURITY DEFINER est le mécanisme Postgres
-- standard pour qu'une AUTRE policy RLS (ci-dessous) puisse vérifier "cet
-- utilisateur est-il admin" sans contourner cette protection pour le reste
-- de l'application (seule cette fonction, précise, bypass -- pas un accès
-- large à admin_users).
create or replace function is_admin(check_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admin_users where id = check_uid and is_active);
$$;

-- Écriture réelle sur `subscriptions` réservée aux admins (voir is_admin
-- ci-dessus) -- jusqu'ici RLS n'autorisait AUCUNE écriture (seul
-- subscriptions_owner_select existait, lecture propriétaire uniquement,
-- voir 0006_rls.sql) : le Super Admin ne pouvait donc pas encore écrire de
-- vrai abonnement sans service_role (jamais configuré dans cet
-- environnement -- voir packages/backend/.env). Ce chemin RLS reste
-- cohérent avec le reste du projet (jamais service_role côté requêtes
-- utilisateur, voir supabaseUserClient.ts).
create policy subscriptions_admin_write on subscriptions
  for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
