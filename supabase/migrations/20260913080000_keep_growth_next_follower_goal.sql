-- Adel (13/09/2026, viralité) : "il faut qu'ils comprennent qu'ils vont
-- gagner une communauté" -- les paliers d'abonnés (25/100/250/500/1000,
-- Audience Pro) existent déjà côté serveur mais restent invisibles : rien
-- n'annonce à l'utilisateur le prochain palier avant qu'il l'atteigne,
-- contrairement à next_share_goal qui existe déjà pour les partages. Ajoute
-- le même calcul côté abonnés, pour construire une barre de progression
-- visible côté client (Profil).
drop function if exists public.keep_growth_reward_status();
create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, next_follower_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid:=auth.uid(); shares integer:=0; follower_count integer:=0; override integer;
  s1 integer:=20; s2 integer:=50; s3 integer:=100;
  f1 integer:=25; f2 integer:=100; f3 integer:=250; f4 integer:=500; f5 integer:=1000;
  reward20 integer:=3; f25d integer:=3; f100s integer:=1; f500d integer:=5; f500s integer:=1;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  shares:=public.keep_qualified_share_count(uid);
  select count(*)::integer into follower_count from public.follows where followee_id=uid;
  select p.follower_count_override into override from public.profiles p where p.id=uid;
  if override is not null then follower_count := override; end if;
  s1:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier1_threshold'),20);
  s2:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold'),50);
  s3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold'),100);
  f1:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier1_threshold'),25);
  f2:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier2_threshold'),100);
  f3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f4:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier4_threshold'),500);
  f5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  reward20:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_20'),3);
  f25d:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_25_discovery'),3);
  f100s:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_100_sort'),1);
  f500d:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_discovery'),5);
  f500s:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_sort'),1);
  qualified_shares:=shares;
  followers:=follower_count;
  bonus_free_credits:=public.keep_growth_free_credit_bonus_for_profile(uid);
  bonus_discovery_profiles:=(case when shares>=s1 then reward20 else 0 end)+(case when follower_count>=f1 then f25d else 0 end)+(case when follower_count>=f4 then f500d else 0 end);
  bonus_sort_trials:=(case when shares>=s3 then 1 else 0 end)+(case when follower_count>=f2 then f100s else 0 end)+(case when follower_count>=f4 then f500s else 0 end);
  next_share_goal:=case when shares<s1 then s1 when shares<s2 then s2 when shares<s3 then s3 else null end;
  next_follower_goal:=case when follower_count<f1 then f1 when follower_count<f2 then f2 when follower_count<f3 then f3 when follower_count<f4 then f4 when follower_count<f5 then f5 else null end;
  audience_pro_unlocked:=follower_count>=f5;
  audience_pro_threshold:=f5;
  return next;
end;
$function$;
grant execute on function public.keep_growth_reward_status() to anon, authenticated;
