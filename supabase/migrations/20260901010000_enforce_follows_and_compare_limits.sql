-- Audit du 01/09/2026 : follows_max et compares_per_month étaient
-- configurables dans Super Admin (plans.tsx) mais jamais appliqués nulle
-- part -- exactement comme les feature flags décoratifs déjà corrigés.
-- keep_follow_profile est le seul chemin d'insertion réel dans `follows`
-- (tous les écrans client passent par ce RPC), donc le plafond y est ajouté
-- directement plutôt que par trigger. keep_compare_access suit le même
-- schéma que keep_smart_sort_access, avec un period_key mensuel puisque
-- compares_per_month se réinitialise chaque mois (contrairement à
-- follows_max, qui est un plafond total du nombre de comptes suivis).

create or replace function public.keep_follow_profile(p_followee_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  inserted_count integer := 0;
  plan text;
  lim integer;
  cnt integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_followee_id is null then raise exception 'followee_required'; end if;
  if uid = p_followee_id then return false; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'follower_profile_missing'; end if;
  if not exists (select 1 from public.profiles where id = p_followee_id and is_public = true) then raise exception 'followee_profile_missing'; end if;

  if not exists (select 1 from public.follows where follower_id = uid and followee_id = p_followee_id) then
    plan := public.keep_active_plan_code(uid);
    lim := public.keep_plan_limit(plan, 'follows_max');
    if lim is not null then
      select count(*)::integer into cnt from public.follows where follower_id = uid;
      if cnt >= lim then raise exception 'FOLLOWS_MAX_REACHED'; end if;
    end if;
  end if;

  insert into public.follows(follower_id,followee_id) values(uid,p_followee_id)
  on conflict (follower_id,followee_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$function$;

create or replace function public.keep_compare_access(p_consume boolean default false)
returns table(plan_code text, allowed boolean, used integer, limit_value integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  plan text;
  lim integer;
  cnt integer := 0;
  period text := to_char(now(), 'YYYY-MM');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_plan_limit(plan, 'compares_per_month');
  select coalesce(used_count,0) into cnt from public.feature_usage_counters where profile_id=uid and feature_key='COMPARE_KEEP' and period_key=period;
  cnt := coalesce(cnt,0);
  plan_code := plan; used := cnt; limit_value := lim;
  unlimited := lim is null;
  if unlimited then allowed := true; remaining := null; return next; return; end if;
  lim := coalesce(lim,0); limit_value := lim;
  if p_consume and cnt < lim then
    insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
    values(uid,'COMPARE_KEEP',period,1,now())
    on conflict(profile_id,feature_key,period_key) do update set used_count=public.feature_usage_counters.used_count+1,updated_at=now();
    cnt := cnt+1;
  end if;
  used := cnt;
  allowed := case when p_consume then cnt <= lim and lim > 0 else cnt < lim end;
  remaining := greatest(lim-cnt,0);
  return next;
end;
$function$;
