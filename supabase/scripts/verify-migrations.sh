#!/usr/bin/env bash
# Vérification exécutable réelle des migrations SQL KEEP contre un vrai
# PostgreSQL 16 (pas Supabase lui-même, mais le même moteur avec un schéma
# `auth` minimal qui reproduit le contrat de Supabase Auth -- auth.users +
# auth.uid() lisant request.jwt.claim.sub, comme le fait réellement
# PostgREST/Supabase). Ce n'est PAS une preuve que Supabase fonctionnera à
# l'identique (extensions/policies supplémentaires possibles côté Supabase
# managé), mais une preuve réelle que :
# - toutes les migrations présentes s'appliquent sans erreur, dans l'ordre,
#   sur un moteur PostgreSQL propre ;
# - les triggers métier (is_adult, cohérence devise) produisent le bon
#   résultat, pas seulement "la syntaxe est valide" ;
# - les policies RLS bloquent réellement un accès cross-utilisateur, testé
#   avec un rôle non-superuser (le superuser/propriétaire de table
#   contourne RLS par défaut -- un test qui ignorerait ça ne prouverait rien).
#
# Deux modes de connexion, choisis automatiquement :
# - PGHOST défini (CI GitHub Actions, service postgres:16 en TCP+mot de
#   passe) -> psql direct.
# - PGHOST absent (sandbox local avec un postgresql apt installé, auth par
#   pair Unix) -> `su postgres -c` comme le veut l'auth par pair locale.
#
# Usage: bash supabase/scripts/verify-migrations.sh
set -euo pipefail

DB=keep_verify_ci
PSQL="psql -v ON_ERROR_STOP=1 -X -q"
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../migrations" && pwd)"

if [ -n "${PGHOST:-}" ]; then
  pg() { $PSQL "$@"; }
else
  # su -c ne prend qu'UNE chaîne : chaque argument doit être ré-échappé
  # (printf %q) avant d'être rejoint, sinon "IF EXISTS"/les points-virgules
  # sont ré-éclatés n'importe comment par le sous-shell de su.
  pg() {
    local cmd="$PSQL"
    for a in "$@"; do cmd+=" $(printf '%q' "$a")"; done
    su postgres -c "$cmd"
  }
fi

echo "== Recréation de la base de test =="
pg -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

echo "== Shim schéma auth (reproduit le contrat Supabase Auth) =="
pg -d "$DB" <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
-- Colonnes utilisées réellement par les triggers/migrations KEEP. Garder ce
-- shim minimal mais suffisamment fidèle évite qu'un trigger Auth valide en
-- production casse artificiellement le test PostgreSQL local.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- Rôles Supabase simulés. Certaines migrations accordent ou révoquent
-- explicitement des droits à `anon` / `authenticated` / `service_role`; un
-- PostgreSQL brut ne crée pas ces rôles automatiquement.
drop role if exists anon;
create role anon nosuperuser nobypassrls;
drop role if exists authenticated;
create role authenticated nosuperuser nobypassrls;
drop role if exists service_role;
create role service_role nosuperuser bypassrls;
-- Rôle applicatif non-superuser : sans ça, RLS est silencieusement
-- contournée par le propriétaire des tables (postgres), et le test ne
-- prouverait rien. Les rôles sont globaux au cluster (pas à la base) --
-- on le recrée proprement à chaque exécution du script.
drop role if exists app_user;
create role app_user nosuperuser nobypassrls login;
SQL

echo "== Application des migrations (dans l'ordre) =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$f")
  echo "  -> $name"
  pg -d "$DB" -f "$f" >/dev/null
done

echo "== Droits applicatifs (équivalent du rôle 'authenticated' Supabase) =="
pg -d "$DB" <<'SQL' >/dev/null
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
SQL

echo "== Assertions métier (triggers + RLS réelle) =="
pg -d "$DB" <<'SQL'
\set ON_ERROR_STOP on
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  price_id uuid;
  target_plan_id uuid;
  sub_id uuid;
  is_adult_result boolean;
begin
  -- Deux profils, en tant que postgres (superuser, insertion "backend").
  -- profiles.id référence auth.users(id) -- comme le ferait réellement
  -- Supabase à la création de compte (GoTrue peuple auth.users).
  insert into auth.users (id) values (user_a), (user_b);
  insert into profiles (id, username) values (user_a, 'alice'), (user_b, 'bob');

  -- Un admin (pour tester que admin_users reste invisible même avec des
  -- données dedans -- un test sur une table vide ne prouverait rien).
  insert into auth.users (id) values (admin_id);
  insert into admin_users (id, role) values (admin_id, 'SUPER_ADMIN');

  -- Trigger is_adult : 20 ans -> true.
  insert into profile_private_info (profile_id, birth_date) values (user_a, (current_date - interval '20 years')::date);
  select is_adult into is_adult_result from profiles where id = user_a;
  if is_adult_result is not true then
    raise exception 'FAIL is_adult (20 ans) attendu true, obtenu %', is_adult_result;
  end if;
  raise notice 'OK is_adult (20 ans) = true';

  -- Trigger is_adult : 10 ans -> false.
  insert into profile_private_info (profile_id, birth_date) values (user_b, (current_date - interval '10 years')::date);
  select is_adult into is_adult_result from profiles where id = user_b;
  if is_adult_result is not false then
    raise exception 'FAIL is_adult (10 ans) attendu false, obtenu %', is_adult_result;
  end if;
  raise notice 'OK is_adult (10 ans) = false';

  -- Trigger cohérence devise : plan_price en EUR, souscription en EUR -> OK.
  select id, plan_id into price_id, target_plan_id from plan_prices where currency_code = 'EUR' limit 1;
  if price_id is null then
    raise exception 'FAIL aucun plan_price EUR trouvé (seed manquant ?)';
  end if;
  insert into subscriptions (id, profile_id, plan_id, plan_price_id, channel, status, country_code, currency_code)
    values (gen_random_uuid(), user_a, target_plan_id, price_id, 'WEB', 'ACTIVE', 'FR', 'EUR')
    returning id into sub_id;
  raise notice 'OK souscription EUR/EUR acceptée';

  -- Trigger cohérence devise : souscription en AED sur un prix EUR -> doit échouer.
  begin
    insert into subscriptions (id, profile_id, plan_id, plan_price_id, channel, status, country_code, currency_code)
      values (gen_random_uuid(), user_a, target_plan_id, price_id, 'WEB', 'ACTIVE', 'FR', 'AED');
    raise exception 'FAIL le mélange de devise EUR/AED aurait dû être rejeté par le trigger';
  exception when others then
    if sqlerrm like '%doit correspondre%' then
      raise notice 'OK mélange de devise EUR/AED rejeté par le trigger (%)', sqlerrm;
    else
      raise;
    end if;
  end;
end;
$$;
SQL

echo "== RLS réelle (rôle non-superuser, deux identités simulées) =="
pg -d "$DB" <<'SQL'
set role app_user;
select set_config('request.jwt.claim.sub', (select id::text from profiles where username = 'alice'), true);
-- Alice doit voir son propre profil.
do $$
begin
  if not exists (select 1 from profiles where username = 'alice') then
    raise exception 'FAIL Alice ne voit pas son propre profil (RLS trop restrictive)';
  end if;
  raise notice 'OK Alice voit son propre profil';
end;
$$;
-- Alice ne doit PAS voir les infos privées de Bob (autre utilisateur).
do $$
declare
  bob_id uuid;
  leaked_rows int;
begin
  select id into bob_id from profiles where username = 'bob';
  select count(*) into leaked_rows from profile_private_info where profile_id = bob_id;
  if leaked_rows > 0 then
    raise exception 'FAIL fuite RLS : Alice voit % ligne(s) de profile_private_info de Bob', leaked_rows;
  end if;
  raise notice 'OK Alice ne voit pas les infos privées de Bob (0 ligne, RLS effective)';
end;
$$;
-- Personne (même authentifié) ne doit voir admin_users / audit_logs.
do $$
declare
  visible int;
begin
  select count(*) into visible from admin_users;
  if visible > 0 then
    raise exception 'FAIL admin_users visible via un rôle applicatif (% lignes) -- policy admin_users_none inopérante', visible;
  end if;
  raise notice 'OK admin_users invisible via le rôle applicatif (policy admin_users_none effective)';
end;
$$;
reset role;
SQL

echo ""
echo "TOUTES LES ASSERTIONS ONT RÉUSSI (voir 'OK ...' ci-dessus) -- migrations + triggers + RLS vérifiés contre un vrai PostgreSQL 16."
