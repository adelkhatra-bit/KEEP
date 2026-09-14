-- Fonctions manquantes : keep_qualified_share_count et keep_growth_reward_status
-- Ces fonctions sont appelées par les migrations 20260828174500 et 20260829002000
-- Elles comptent les partages publics et calculent les bonus de croissance

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$ select count(*)::integer from public.keep_decisions where profile_id = p_uid and decision = 'KEPT' and visibility = 'PUBLIC'; $$;

grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language plpgsql
volatile
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  shares integer := 0;
  follower_count integer := 0;
  s2 integer := 50;
  s3 integer := 100;
  f3 integer := 250;
  f5 integer := 1000;
  reward50 integer := 5;
  reward100 integer := 20;
  f250c integer := 5;
  f1000c integer := 20;
  total_bonus integer := 0;
begin
  if uid is null then
    return query select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 50::integer, false, 100::integer;
    return;
  end if;

  select count(*)::integer into shares from public.keep_decisions where profile_id = uid and decision = 'KEPT' and visibility = 'PUBLIC';
  select count(*)::integer into follower_count from public.follows where followee_id = uid;

  s2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1),50);
  s3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1),100);
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1),250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1),1000);
  reward50 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1),5);
  reward100 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1),20);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1),5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1),20);

  total_bonus := (case when shares >= s2 then reward50 else 0 end)
               + (case when shares >= s3 then reward100 else 0 end)
               + (case when follower_count >= f3 then f250c else 0 end)
               + (case when follower_count >= f5 then f1000c else 0 end);

  return query select shares, follower_count, total_bonus, 0::integer, 0::integer, s2::integer, (follower_count >= 100), 100::integer;
end;
$function$;

grant execute on function public.keep_growth_reward_status() to authenticated;
