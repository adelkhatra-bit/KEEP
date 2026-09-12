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
  v_qualified_shares integer := 0;
  v_followers integer := 0;
  v_bonus_free_credits integer := 0;
  v_bonus_discovery_profiles integer := 0;
  v_bonus_sort_trials integer := 0;
  v_next_share_goal integer := null;
  current_plan text := 'FREE';
  v_audience_pro_unlocked boolean := false;
  v_audience_pro_threshold integer := 1000;
  s2 integer;
  s3 integer;
  f1 integer;
  f2 integer;
  f3 integer;
  f5 integer;
begin
  if uid is null then
    v_qualified_shares := 0;
    v_followers := 0;
    v_bonus_free_credits := 0;
    v_bonus_discovery_profiles := 0;
    v_bonus_sort_trials := 0;
    v_next_share_goal := 20;
    v_audience_pro_unlocked := false;
    v_audience_pro_threshold := 1000;
    return query select v_qualified_shares, v_followers, v_bonus_free_credits, v_bonus_discovery_profiles, v_bonus_sort_trials, v_next_share_goal, v_audience_pro_unlocked, v_audience_pro_threshold;
    return;
  end if;

  v_qualified_shares := public.keep_qualified_share_count(uid);

  select coalesce(count(*)::integer, 0) into v_followers
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
  v_audience_pro_threshold := f5;

  if v_qualified_shares >= s3 then
    v_bonus_free_credits := v_bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1), 20);
    v_bonus_sort_trials := v_bonus_sort_trials + 1;
  elsif v_qualified_shares >= s2 then
    v_bonus_free_credits := v_bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1), 5);
  end if;

  if v_followers >= f5 then
    v_bonus_free_credits := v_bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1), 20);
    v_bonus_discovery_profiles := v_bonus_discovery_profiles + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_discovery' limit 1), 5);
    v_bonus_sort_trials := v_bonus_sort_trials + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_sort' limit 1), 1);
  elsif v_followers >= f3 then
    v_bonus_free_credits := v_bonus_free_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1), 5);
  elsif v_followers >= f2 then
    v_bonus_sort_trials := v_bonus_sort_trials + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_100_sort' limit 1), 1);
  elsif v_followers >= f1 then
    v_bonus_discovery_profiles := v_bonus_discovery_profiles + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_25_discovery' limit 1), 3);
  end if;

  if v_qualified_shares < 20 then
    v_next_share_goal := 20;
  elsif v_qualified_shares < s2 then
    v_next_share_goal := s2;
  elsif v_qualified_shares < s3 then
    v_next_share_goal := s3;
  else
    v_next_share_goal := null;
  end if;

  v_audience_pro_unlocked := (current_plan in ('CREATOR_PRO', 'VENUE_PRO', 'PREMIUM') and v_followers >= v_audience_pro_threshold);

  return query select v_qualified_shares, v_followers, v_bonus_free_credits, v_bonus_discovery_profiles, v_bonus_sort_trials, v_next_share_goal, v_audience_pro_unlocked, v_audience_pro_threshold;
end;
$$;

-- Accorder l'accès à la fonction pour les utilisateurs authentifiés
grant execute on function public.keep_growth_reward_status() to authenticated;

-- Audit : cette fonction retourne les VRAIES données de croissance depuis la base de données.
-- Elle compte réellement les followers et partages qualifiés.
-- Elle NE DOIT PAS être utilisée pour valider des droits d'accès ou débloquer des fonctionnalités.
-- Les vérifications de plan doivent toujours se faire côté application via loadCurrentPlanCode().
