-- Adel (29/09/2026) :
-- 1. « s'il sort au milieu de la partie ou à la première musique, il faut
--    que ça lui débite toujours son Solo… la fille a un petit bug ».
--    BUG RÉEL : depuis 20260927233000, le quota comptait uniquement les
--    parties TERMINÉES (historique des Solos). Quitter avant la fin
--    n'était jamais décompté -> Solos illimités en sortant avant la fin.
--    Correctif : on compte chaque DÉMARRAGE, de façon atomique, au moment
--    où le pack est prêt (keep_battle_solo_consume_daily_start). Quitter ne
--    rend jamais la partie.
-- 2. « on met une limite à tous pour les Solos, pas d'illimité… on pourra
--    vendre des options / l'intégrer aux abonnements ». Plus d'illimité :
--    chaque formule a sa propre limite réglable dans Super Admin >
--    Remote Config (battle_solo_daily_limit_<formule>), 10 par défaut.
--    Le Battle en ligne n'est pas touché.

create table if not exists public.keep_battle_solo_daily_usage (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  starts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, usage_date)
);
alter table public.keep_battle_solo_daily_usage enable row level security;
revoke all on public.keep_battle_solo_daily_usage from anon, authenticated;

create or replace function public.keep_battle_solo_daily_limit_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path='public'
as $$
declare p text := lower(coalesce(public.keep_active_plan_code(p_uid), 'FREE')); v integer;
begin
  select greatest(1, (value #>> '{}')::integer) into v from public.remote_config where key = 'battle_solo_daily_limit_' || p;
  if v is null then
    select greatest(1, (value #>> '{}')::integer) into v from public.remote_config where key = 'battle_solo_daily_limit_free';
  end if;
  return coalesce(v, 10);
end $$;

create or replace function public.keep_battle_solo_consume_daily_start()
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare uid uuid := auth.uid(); v_limit integer; v_starts integer; v_plan text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_plan := public.keep_active_plan_code(uid);
  v_limit := public.keep_battle_solo_daily_limit_for_profile(uid);
  insert into public.keep_battle_solo_daily_usage(profile_id, usage_date, starts, updated_at)
  values (uid, current_date, 1, now())
  on conflict (profile_id, usage_date) do update
    set starts = keep_battle_solo_daily_usage.starts + 1, updated_at = now()
    where keep_battle_solo_daily_usage.starts < v_limit
  returning starts into v_starts;
  if v_starts is null then raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%', v_limit; end if;
  return jsonb_build_object('used', v_starts, 'limit', v_limit, 'remaining', greatest(0, v_limit - v_starts), 'unlimited', false, 'plan', v_plan);
end $$;

create or replace function public.keep_battle_solo_daily_status()
returns jsonb language plpgsql stable security definer set search_path='public'
as $$
declare uid uuid := auth.uid(); lim integer; used integer := 0; plan text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_battle_solo_daily_limit_for_profile(uid);
  select coalesce(starts, 0) into used from public.keep_battle_solo_daily_usage where profile_id = uid and usage_date = current_date;
  used := coalesce(used, 0);
  return jsonb_build_object('plan', plan, 'used', used, 'limit', lim, 'remaining', greatest(0, lim - used), 'unlimited', false, 'resetsAt', (current_date + 1)::timestamptz);
end $$;

grant execute on function public.keep_battle_solo_consume_daily_start() to authenticated;
grant execute on function public.keep_battle_solo_daily_status() to authenticated;

-- Réglages Super Admin, une ligne par formule (sans écraser un réglage existant).
insert into public.remote_config(key, value, description, updated_at) values
  ('battle_solo_daily_limit_free', '10'::jsonb, 'Battle SOLO : parties par jour, formule gratuite. Chaque départ compte, même abandonné.', now()),
  ('battle_solo_daily_limit_premium', '10'::jsonb, 'Battle SOLO : parties par jour, formule Premium.', now()),
  ('battle_solo_daily_limit_creator_pro', '10'::jsonb, 'Battle SOLO : parties par jour, formule Créateur Pro.', now()),
  ('battle_solo_daily_limit_venue_pro', '10'::jsonb, 'Battle SOLO : parties par jour, formule Lieu Pro.', now())
on conflict (key) do nothing;
