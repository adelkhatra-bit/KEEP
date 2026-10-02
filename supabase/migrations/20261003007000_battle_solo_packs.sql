-- Adel (02/10/2026) : « un utilisateur n'a plus de Solo : en bas, recharge à
-- 2h + un bouton pour racheter 10 ou 25 Solos contre des Free ; c'est la
-- plateforme qui vend les Solos ; réglable dans le Super Admin ; quand il
-- recharge, il conserve ce qu'il avait ».
--
-- - Packs réglables dans le Super Admin (Remote config) :
--   battle_solo_pack_small_solos / _free (10 Solos · 3 Free par défaut)
--   battle_solo_pack_large_solos / _free (25 Solos · 6 Free par défaut).
-- - keep_battle_solo_pack_purchases : chaque achat (Solos ajoutés, Free payés).
-- - Les Solos achetés S'AJOUTENT à la limite du jour et ne se perdent pas :
--   limite du jour = limite de la formule + Solos achetés pas encore utilisés
--   (utilisés = parties jouées au-delà de la limite de la formule les jours
--   précédents). Aucune fonction de jeu n'est modifiée.
-- - Le solde Free reste CALCULÉ (jamais réinitialisé) : les Free payés pour
--   des packs y sont soustraits comme les autres achats.
-- - Paiement par carte / Apple Pay : non câblé ici (rien n'est encaissé hors
--   Free) ; sur iPhone un achat numérique passe obligatoirement par Apple.
-- Additif : aucune donnée utilisateur modifiée ni supprimée.

create table if not exists public.keep_battle_solo_pack_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pack_code text not null check (pack_code in ('SMALL','LARGE')),
  solos integer not null check (solos > 0),
  free_spent integer not null check (free_spent >= 0),
  payment_method text not null default 'FREE' check (payment_method in ('FREE')),
  created_at timestamptz not null default now()
);
create index if not exists keep_battle_solo_pack_purchases_profile_idx on public.keep_battle_solo_pack_purchases(profile_id, created_at);
alter table public.keep_battle_solo_pack_purchases enable row level security;
revoke all on public.keep_battle_solo_pack_purchases from anon, authenticated;

insert into public.remote_config(key, value, description) values
  ('battle_solo_pack_small_solos', '10'::jsonb, 'Battle SOLO · petit pack : nombre de Solos'),
  ('battle_solo_pack_small_free',  '3'::jsonb,  'Battle SOLO · petit pack : prix en Free'),
  ('battle_solo_pack_large_solos', '25'::jsonb, 'Battle SOLO · grand pack : nombre de Solos'),
  ('battle_solo_pack_large_free',  '6'::jsonb,  'Battle SOLO · grand pack : prix en Free')
on conflict (key) do nothing;

-- Limite de la formule seule (ancien calcul, inchangé).
create or replace function public.keep_battle_solo_plan_limit(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare p text := lower(coalesce(public.keep_active_plan_code(p_uid), 'FREE')); v integer;
begin
  select greatest(1, (value #>> '{}')::integer) into v from public.remote_config where key = 'battle_solo_daily_limit_' || p;
  if v is null then
    select greatest(1, (value #>> '{}')::integer) into v from public.remote_config where key = 'battle_solo_daily_limit_free';
  end if;
  return coalesce(v, 10);
end $function$;
revoke all on function public.keep_battle_solo_plan_limit(uuid) from public, anon, authenticated;

-- Journée Battle : de 2 h à 2 h (Europe/Paris), comme l'affichage.
create or replace function public.keep_battle_solo_today()
returns date
language sql
stable
as $$ select ((now() at time zone 'Europe/Paris') - interval '2 hours')::date $$;

-- Solos achetés pas encore utilisés AVANT aujourd'hui (le jour en cours se
-- lit directement dans la limite, sinon jouer réduirait la limite en même temps).
create or replace function public.keep_battle_solo_bonus_remaining(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_bought integer := 0;
  v_first date;
  v_plan integer := public.keep_battle_solo_plan_limit(p_uid);
  v_used integer := 0;
begin
  select coalesce(sum(solos),0)::integer, min((created_at at time zone 'Europe/Paris' - interval '2 hours')::date)
    into v_bought, v_first
  from public.keep_battle_solo_pack_purchases where profile_id = p_uid;
  if v_bought <= 0 then return 0; end if;
  select coalesce(sum(greatest(0, u.starts - v_plan)),0)::integer into v_used
  from public.keep_battle_solo_daily_usage u
  where u.profile_id = p_uid and u.usage_date >= v_first and u.usage_date < public.keep_battle_solo_today();
  return greatest(0, v_bought - v_used);
end $function$;
revoke all on function public.keep_battle_solo_bonus_remaining(uuid) from public, anon, authenticated;

-- Limite utilisée par le statut ET par le démarrage d'un Solo (même nom,
-- même signature) : formule + Solos achetés restants.
create or replace function public.keep_battle_solo_daily_limit_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  return public.keep_battle_solo_plan_limit(p_uid) + public.keep_battle_solo_bonus_remaining(p_uid);
end $function$;

create or replace function public.keep_battle_solo_pack_spent_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$ select coalesce(sum(free_spent),0)::integer from public.keep_battle_solo_pack_purchases where profile_id = p_uid $$;
revoke all on function public.keep_battle_solo_pack_spent_for_profile(uuid) from public, anon, authenticated;

-- Solde Free calculé : identique à la version en place + achats de packs.
create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer:=3; signup_bonus integer:=20; follower_count integer:=0; follower_bonus integer:=0;
  f3 integer; f5 integer; f250c integer; f1000c integer; referral_bonus integer:=0; monthly_bonus integer:=0;
  admin_grant integer:=0; battle_adjustment integer:=0; marketplace_adjustment integer:=0;
  solo_pack_spent integer:=0;
  ledger_used integer:=0; derived_used integer:=0; used integer:=0; capacity integer:=0;
begin
  if p_uid is null then return 0; end if;
  select count(*)::integer into follower_count from public.follows where followee_id=p_uid;
  f3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  f250c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
  f1000c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
  follower_bonus:=(case when follower_count>=f3 then f250c else 0 end)+(case when follower_count>=f5 then f1000c else 0 end);
  referral_bonus:=public.keep_referral_free_credit_bonus_for_profile(p_uid);
  monthly_bonus:=public.keep_monthly_free_bonus_for_profile(p_uid);
  admin_grant:=public.keep_admin_credit_grant_total_for_profile(p_uid);
  battle_adjustment:=public.keep_battle_credit_adjustment_for_profile(p_uid);
  marketplace_adjustment:=public.keep_playlist_sale_free_adjustment_for_profile(p_uid);
  solo_pack_spent:=public.keep_battle_solo_pack_spent_for_profile(p_uid);
  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used);
  capacity:=greatest(used,guest_limit+signup_bonus+follower_bonus+referral_bonus+monthly_bonus+admin_grant+battle_adjustment+marketplace_adjustment-solo_pack_spent);
  return greatest(0,capacity-used);
end;
$function$;

create or replace function public.keep_battle_solo_pack_price(p_code text, out solos integer, out free integer)
language plpgsql
stable
set search_path = public
as $function$
declare k text := case upper(coalesce(p_code,'')) when 'SMALL' then 'small' when 'LARGE' then 'large' else null end;
begin
  if k is null then raise exception 'SOLO_PACK_UNKNOWN' using errcode='22023'; end if;
  solos := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'battle_solo_pack_'||k||'_solos'), case k when 'small' then 10 else 25 end));
  free  := greatest(0, coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'battle_solo_pack_'||k||'_free'),  case k when 'small' then 3 else 6 end));
end $function$;

create or replace function public.keep_battle_solo_packs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare uid uuid := auth.uid(); s record; l record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into s from public.keep_battle_solo_pack_price('SMALL');
  select * into l from public.keep_battle_solo_pack_price('LARGE');
  return jsonb_build_object(
    'packs', jsonb_build_array(
      jsonb_build_object('code','SMALL','solos',s.solos,'free',s.free),
      jsonb_build_object('code','LARGE','solos',l.solos,'free',l.free)),
    'bonusRemaining', public.keep_battle_solo_bonus_remaining(uid),
    'balance', public.keep_theoretical_free_credit_remaining_for_profile(uid));
end $function$;
revoke all on function public.keep_battle_solo_packs() from public, anon;
grant execute on function public.keep_battle_solo_packs() to authenticated;

create or replace function public.keep_battle_solo_buy_pack(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  v record;
  v_balance integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  -- Un achat à la fois par compte (double-tap, deux appareils).
  perform pg_advisory_xact_lock(hashtext('solo_pack:' || uid::text));
  select * into v from public.keep_battle_solo_pack_price(p_code);
  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  if v_balance < v.free then
    raise exception 'SOLO_PACK_NOT_ENOUGH_FREE' using errcode='P0001', detail = format('need=%s balance=%s', v.free, v_balance);
  end if;
  insert into public.keep_battle_solo_pack_purchases(profile_id, pack_code, solos, free_spent)
  values (uid, upper(p_code), v.solos, v.free);
  insert into public.notifications(profile_id, type, title, body, data)
  values (uid, 'BATTLE_SOLO_PACK', '🎯 Solos rechargés',
          format('+%s Solos ajoutés (-%s Free). Ils s’ajoutent à tes Solos du jour et ne se perdent pas.', v.solos, v.free),
          jsonb_build_object('pack', upper(p_code), 'solos', v.solos, 'creditDelta', -v.free));
  return jsonb_build_object(
    'solosAdded', v.solos,
    'freeSpent', v.free,
    'balance', public.keep_theoretical_free_credit_remaining_for_profile(uid));
end $function$;
revoke all on function public.keep_battle_solo_buy_pack(text) from public, anon;
grant execute on function public.keep_battle_solo_buy_pack(text) to authenticated;
