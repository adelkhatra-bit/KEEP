-- Fonctions manquantes : keep_qualified_share_count et keep_growth_reward_status
-- Ces fonctions sont appelées par les migrations 20260828174500 et 20260829002000
-- mais n'étaient jamais définie, causant des erreurs de migration.

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.keep_decisions
  where profile_id = p_uid
    and decision = 'KEPT'
    and visibility = 'PUBLIC';
$$;

grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  shares integer := 0;
  follower_count integer := 0;
  bonus_credits integer := 0;
  s2 integer := 50;
  s3 integer := 100;
  f3 integer := 250;
  f5 integer := 1000;
  reward50 integer := 5;
  reward100 integer := 20;
  f250c integer := 5;
  f1000c integer := 20;
  next_goal integer := 20;
  threshold integer := 1000;
  discovery_bonus integer := 0;
  sort_bonus integer := 0;
begin
  if uid is null then
    return query select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 20::integer, false, 1000::integer;
    return;
  end if;

  shares := public.keep_qualified_share_count(uid);
  select count(*)::integer into follower_count from public.follows where followee_id = uid;

  s2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1), 50);
  s3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1), 100);
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1), 250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1), 1000);
  reward50 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1), 5);
  reward100 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1), 20);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1), 5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1), 20);
  next_goal := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_next_share_goal' limit 1), 20);
  threshold := coalesce((select (value #>> '{}')::integer from public.remote_config where key='audience_pro_threshold' limit 1), 1000);
  discovery_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='bonus_discovery_profiles' limit 1), 0);
  sort_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='bonus_sort_trials' limit 1), 0);

  bonus_credits := (case when shares >= s2 then reward50 else 0 end)
                 + (case when shares >= s3 then reward100 else 0 end)
                 + (case when follower_count >= f3 then f250c else 0 end)
                 + (case when follower_count >= f5 then f1000c else 0 end);

  return query select
    shares,
    follower_count,
    bonus_credits,
    discovery_bonus,
    sort_bonus,
    next_goal,
    (follower_count >= threshold)::boolean,
    threshold;
end;
$$;

grant execute on function public.keep_growth_reward_status() to authenticated;
