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
  s2 integer;
  s3 integer;
  f1 integer;
  f2 integer;
  f3 integer;
  f5 integer;
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

  qualified_shares := public.keep_qualified_share_count(uid);

  select coalesce(count(*)::integer, 0) into followers
  from public.follows
  where followee_id = uid;

  current_plan := coalesce((
    select p.code::text
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.profile_id = uid
      and s.status in ('TRIALING', 'ACTIVE')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.created_at desc
    limit 1
  ), 'FREE');

  s2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1), 50);
  s3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1), 100);
  f1 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier1_threshold' limit 1), 25);
  f2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier2_threshold' limit 1), 100);
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1), 250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1), 1000);
  audience_pro_threshold := f5;

  if qualified_shares >= s3 then
    bonus_free_credits := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1), 20);
    bonus_sort_trials := 1;
  elsif qualified_shares >= s2 then
    bonus_free_credits := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1), 5);
  else
    bonus_free_credits := 0;
  end if;

  if followers >= f5 then
    bonus_free_credits := bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1), 20);
    bonus_discovery_profiles := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_discovery' limit 1), 5);
    bonus_sort_trials := bonus_sort_trials + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_sort' limit 1), 1);
  elsif followers >= f3 then
    bonus_free_credits := bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1), 5);
    bonus_discovery_profiles := 0;
  elsif followers >= f2 then
    bonus_sort_trials := bonus_sort_trials + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_100_sort' limit 1), 1);
    bonus_discovery_profiles := 0;
  elsif followers >= f1 then
    bonus_discovery_profiles := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_25_discovery' limit 1), 3);
    bonus_sort_trials := 0;
  else
    bonus_discovery_profiles := 0;
    bonus_sort_trials := 0;
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
