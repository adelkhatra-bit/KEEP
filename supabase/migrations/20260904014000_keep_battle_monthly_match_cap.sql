-- Adel (04/09/2026) : "pour les inscriptions sur le Battle, que je puisse
-- limiter les Battle par utilisateurs, par formule, par mois" -- aucune
-- limite n'existait sur le NOMBRE de Battle en ligne joues par mois (seule
-- la mise en Free par match existait). Meme convention que "Limites par
-- formule" partout ailleurs : vide = illimite (rien ne change par
-- defaut), un chiffre = plafond mensuel reel, par formule.
--
-- Compteur DEDIE (pas les holds de mise) : un profil en acces payant
-- (keep_profile_has_paid_battle_access) ne cree jamais de ligne dans
-- keep_battle_arena_credit_holds, donc compter sur cette table aurait
-- laisse ces formules totalement hors du plafond -- exactement l'inverse
-- de "par formule".
create table if not exists public.keep_battle_monthly_match_counters (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month_key text not null,
  matches_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, month_key)
);
alter table public.keep_battle_monthly_match_counters enable row level security;
drop policy if exists "keep_battle_monthly_match_counters_self_read" on public.keep_battle_monthly_match_counters;
create policy "keep_battle_monthly_match_counters_self_read" on public.keep_battle_monthly_match_counters
  for select using (auth.uid() = profile_id);

-- keep_battle_arena_lock_stake est le SEUL point de passage reel avant
-- qu'un profil ne rejoigne activement un match (creation d'arene, promotion
-- depuis la file, revanche) -- deja utilise pour verrouiller la mise Free.
-- Le plafond mensuel y est verifie AVANT le bypass "acces payant" pour
-- s'appliquer aussi aux formules qui ne misent pas de Free.
create or replace function public.keep_battle_arena_lock_stake(p_arena_id uuid, p_match_no integer, p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  stake integer := 3;
  remaining integer;
  plan text;
  monthly_limit integer;
  v_month_key text := to_char(now(),'YYYY-MM');
  matches_this_month integer := 0;
begin
  if exists(select 1 from public.keep_battle_arena_credit_holds where arena_id=p_arena_id and match_no=p_match_no and profile_id=p_profile_id and status='LOCKED') then return true; end if;

  plan := public.keep_active_plan_code(p_profile_id);
  monthly_limit := public.keep_plan_limit(plan, 'battle_matches_per_month');
  if monthly_limit is not null then
    select matches_count into matches_this_month from public.keep_battle_monthly_match_counters where profile_id=p_profile_id and month_key=v_month_key;
    if coalesce(matches_this_month,0) >= monthly_limit then return false; end if;
  end if;

  if public.keep_profile_has_paid_battle_access(p_profile_id) then
    insert into public.keep_battle_monthly_match_counters(profile_id,month_key,matches_count,updated_at)
    values(p_profile_id,v_month_key,1,now())
    on conflict(profile_id,month_key) do update set matches_count=keep_battle_monthly_match_counters.matches_count+1,updated_at=now();
    return true;
  end if;

  stake:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='battle_arena_stake_free_credits' limit 1),3));
  remaining:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  if remaining<stake then return false; end if;
  insert into public.keep_battle_arena_credit_holds(arena_id,match_no,profile_id,amount,status)
  values(p_arena_id,p_match_no,p_profile_id,stake,'LOCKED')
  on conflict(arena_id,match_no,profile_id) do update set amount=excluded.amount,status='LOCKED',settled_at=null;

  insert into public.keep_battle_monthly_match_counters(profile_id,month_key,matches_count,updated_at)
  values(p_profile_id,v_month_key,1,now())
  on conflict(profile_id,month_key) do update set matches_count=keep_battle_monthly_match_counters.matches_count+1,updated_at=now();
  return true;
end;
$function$;

-- Statut consultable côté app (comme les autres quotas : allowed/used/limit/
-- remaining/unlimited), pour afficher un message clair si un jour un admin
-- configure un plafond.
create or replace function public.keep_battle_monthly_match_status()
returns table(plan_code text, used integer, limit_value integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  plan text;
  lim integer;
  used_count integer := 0;
  v_month_key text := to_char(now(),'YYYY-MM');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_plan_limit(plan, 'battle_matches_per_month');
  select matches_count into used_count from public.keep_battle_monthly_match_counters where profile_id=uid and month_key=v_month_key;
  plan_code := plan;
  used := coalesce(used_count, 0);
  limit_value := lim;
  unlimited := lim is null;
  remaining := case when lim is null then null else greatest(lim - coalesce(used_count,0), 0) end;
  return next;
end;
$function$;
revoke all on function public.keep_battle_monthly_match_status() from public;
grant execute on function public.keep_battle_monthly_match_status() to authenticated;
