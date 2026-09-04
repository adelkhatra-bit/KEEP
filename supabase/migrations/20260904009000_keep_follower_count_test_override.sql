-- Adel (04/09/2026) : "je veux pouvoir le debloquer a un utilisateur ...
-- pareil pour soiree limitee pour la formule Pro ... mettre un minimum
-- d'abonnes comme ca je pourrais faire des tests" -- confirme en lisant le
-- code live : keep_event_creation_status bloque la creation d'evenement
-- (TOUTES formules, meme VENUE_PRO) tant que le compte n'a pas 500 abonnes
-- REELS (growth_followers_tier4_threshold), et keep_growth_reward_status
-- calcule les paliers de croissance sur ce meme compte reel -- aucun moyen
-- de tester ces deux ecrans sans avoir vraiment 500+ abonnes. Un seul
-- override par profil (pas un systeme generique eparpille) couvre les deux
-- endroits d'un coup, puisqu'ils lisent la meme donnee (follows).
alter table public.profiles add column if not exists follower_count_override integer null;

create or replace function public.admin_set_follower_count_override(p_profile_id uuid, p_override integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  update public.profiles set follower_count_override = p_override where id = p_profile_id;
  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, after)
  values(v_uid, 'user.follower_override.set', 'profile', p_profile_id::text, jsonb_build_object('override', p_override));
end;
$$;
revoke all on function public.admin_set_follower_count_override(uuid,integer) from public;
grant execute on function public.admin_set_follower_count_override(uuid,integer) to authenticated;

create or replace function public.keep_growth_reward_status()
 RETURNS TABLE(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
  audience_pro_unlocked:=follower_count>=f5;
  audience_pro_threshold:=f5;
  return next;
end;
$function$;

create or replace function public.keep_event_creation_status()
 RETURNS TABLE(plan_code text, allowed boolean, used integer, limit_value integer, remaining integer, unlimited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  plan text;
  lim integer;
  cnt integer;
  follower_count integer := 0;
  override integer;
  min_followers integer := 500;
  month_start timestamptz := date_trunc('month', now());
begin
  if uid is null then raise exception 'authentication_required'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_plan_limit(plan, 'events_per_month');

  select count(*)::integer into cnt
  from public.events
  where creator_id = uid and created_at >= month_start;

  select count(*)::integer into follower_count
  from public.follows
  where followee_id = uid;

  select p.follower_count_override into override from public.profiles p where p.id = uid;
  if override is not null then follower_count := override; end if;

  select coalesce((value #>> '{}')::integer, 500)
    into min_followers
  from public.remote_config
  where key = 'growth_followers_tier4_threshold';
  min_followers := coalesce(min_followers, 500);

  plan_code := plan;
  used := cnt;
  limit_value := lim;
  unlimited := lim is null and plan = 'VENUE_PRO';
  allowed := follower_count >= min_followers and (unlimited or cnt < coalesce(lim, 0));
  remaining := case when unlimited then null else greatest(coalesce(lim, 0) - cnt, 0) end;
  return next;
end;
$function$;
