-- ============================================================================
-- Fonction complémentaire manquante : keep_qualified_share_count
-- Comptabilise le nombre de fois que les keeps d'un profil ont été copiés
-- ============================================================================

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.keep_decisions
  where source_user_id = p_uid
    and decision = 'KEPT'
    and source_type is not null;
$$;

grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

-- ============================================================================
-- Définition de la fonction keep_growth_reward_status() manquante
-- Retourne les métriques de croissance réelles de l'utilisateur actuel
-- AUDIT: Cette fonction était appelée mais jamais définie. Elle doit compter réellement
-- les abonnés et partages en base de données et retourner les récompenses correspondantes.

create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  current_plan text := 'FREE';
  s2 integer := 50;
  s3 integer := 100;
  f1 integer := 25;
  f2 integer := 100;
  f3 integer := 250;
  f5 integer := 1000;
begin
  if uid is null then
    qualified_shares := 0;
    followers := 0;
    bonus_free_credits := 0;
    bonus_discovery_profiles := 0;
    bonus_sort_trials := 0;
    next_share_goal := 20;
    audience_pro_unlocked := false;
    audience_pro_threshold := 1000;
    return next;
    return;
  end if;

  select public.keep_qualified_share_count(uid) into qualified_shares;

  select coalesce(count(*)::integer, 0) into followers
  from public.follows
  where followee_id = uid;

  select coalesce(p.code::text,'FREE') into current_plan
  from public.subscriptions s
  join public.plans p on p.id=s.plan_id
  where s.profile_id=uid and s.status in ('ACTIVE','TRIALING')
  order by s.created_at desc limit 1;
  current_plan := coalesce(current_plan,'FREE');

  select coalesce((value #>> '{}')::integer, 50) into s2 from public.remote_config where key='growth_share_tier2_threshold';
  select coalesce((value #>> '{}')::integer, 100) into s3 from public.remote_config where key='growth_share_tier3_threshold';
  select coalesce((value #>> '{}')::integer, 25) into f1 from public.remote_config where key='growth_followers_tier1_threshold';
  select coalesce((value #>> '{}')::integer, 100) into f2 from public.remote_config where key='growth_followers_tier2_threshold';
  select coalesce((value #>> '{}')::integer, 250) into f3 from public.remote_config where key='growth_followers_tier3_threshold';
  select coalesce((value #>> '{}')::integer, 1000) into f5 from public.remote_config where key='growth_followers_tier5_threshold';
  audience_pro_threshold := f5;

  bonus_free_credits := 0;
  bonus_discovery_profiles := 0;
  bonus_sort_trials := 0;

  if qualified_shares >= s3 then
    select coalesce((value #>> '{}')::integer, 20) into bonus_free_credits from public.remote_config where key='growth_share_reward_100';
    bonus_sort_trials := 1;
  elsif qualified_shares >= s2 then
    select coalesce((value #>> '{}')::integer, 5) into bonus_free_credits from public.remote_config where key='growth_share_reward_50';
  end if;

  if followers >= f5 then
    select coalesce((value #>> '{}')::integer, 20) into bonus_free_credits from public.remote_config where key='growth_followers_reward_1000_credits';
    select coalesce((value #>> '{}')::integer, 5) into bonus_discovery_profiles from public.remote_config where key='growth_followers_reward_500_discovery';
    select coalesce((value #>> '{}')::integer, 1) into bonus_sort_trials from public.remote_config where key='growth_followers_reward_500_sort';
  elsif followers >= f3 then
    select coalesce((value #>> '{}')::integer, 5) into bonus_free_credits from public.remote_config where key='growth_followers_reward_250_credits';
  elsif followers >= f2 then
    select coalesce((value #>> '{}')::integer, 1) into bonus_sort_trials from public.remote_config where key='growth_followers_reward_100_sort';
  elsif followers >= f1 then
    select coalesce((value #>> '{}')::integer, 3) into bonus_discovery_profiles from public.remote_config where key='growth_followers_reward_25_discovery';
  end if;

  if qualified_shares < 20 then
    next_share_goal := 20;
  elsif qualified_shares < s2 then
    next_share_goal := s2;
  elsif qualified_shares < s3 then
    next_share_goal := s3;
  else
    next_share_goal := null;
  end if;

  audience_pro_unlocked := (current_plan in ('CREATOR_PRO', 'VENUE_PRO', 'PREMIUM') and followers >= audience_pro_threshold);

  return next;
end;
$$;

-- Accorder l'accès à la fonction pour les utilisateurs authentifiés
grant execute on function public.keep_growth_reward_status() to authenticated;

-- Audit : cette fonction retourne les VRAIES données de croissance depuis la base de données.
-- Elle compte réellement les followers et partages qualifiés.
-- Elle NE DOIT PAS être utilisée pour valider des droits d'accès ou débloquer des fonctionnalités.
-- Les vérifications de plan doivent toujours se faire côté application via loadCurrentPlanCode().
