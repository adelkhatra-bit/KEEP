-- ============================================================================
-- Fonction complémentaire manquante : keep_qualified_share_count
-- Comptabilise le nombre de fois que les keeps d'un profil ont été copiés
-- ============================================================================

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to public
as $function$
  select coalesce(count(*)::integer, 0)
  from public.keep_decisions
  where source_user_id = p_uid
    and decision = 'KEPT'
    and source_type is not null;
$function$;

grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

-- ============================================================================
-- Définition de la fonction keep_growth_reward_status() manquante
-- Retourne les métriques de croissance réelles de l'utilisateur actuel
-- AUDIT: Cette fonction était appelée mais jamais définie. Elle doit compter réellement
-- les abonnés et partages en base de données et retourner les récompenses correspondantes.

create or replace function public.keep_growth_reward_status()
returns table (
  qualified_shares integer,
  followers integer,
  bonus_free_credits integer,
  bonus_discovery_profiles integer,
  bonus_sort_trials integer,
  next_share_goal integer,
  audience_pro_unlocked boolean,
  audience_pro_threshold integer
)
language plpgsql
security definer
set search_path to public, auth
as $function$
declare
  uid uuid := auth.uid();
  share_count integer := 0;
  follower_count integer := 0;
  bonus_credits integer := 0;
  bonus_discovery integer := 0;
  bonus_sort integer := 0;
  next_goal integer := null;
  current_plan text := 'FREE';
  is_audience_pro_unlocked boolean := false;
  threshold integer := 1000;
  s2 integer;
  s3 integer;
  f1 integer;
  f2 integer;
  f3 integer;
  f5 integer;
begin
  -- Si anonyme ou pas d'utilisateur, retourner des zéros
  if uid is null then
    return query select 0::integer, 0::integer, 0::integer, 0::integer, 0::integer, 20::integer, false::boolean, 1000::integer;
    return;
  end if;

  -- Compter les partages qualifiés (nombres réels en base)
  share_count := public.keep_qualified_share_count(uid);

  -- Compter les abonnés réels (followers) — via table follows
  select coalesce(count(*)::integer, 0) into follower_count
  from public.follows
  where followee_id = uid;

  -- Charger le plan actuel de l'utilisateur
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

  -- Charger les seuils depuis remote_config
  s2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier2_threshold' limit 1), 50);
  s3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_tier3_threshold' limit 1), 100);
  f1 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier1_threshold' limit 1), 25);
  f2 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier2_threshold' limit 1), 100);
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold' limit 1), 250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold' limit 1), 1000);
  threshold := f5;

  -- Calculer les récompenses progressives basées sur les métriques réelles
  if share_count >= s3 then
    bonus_credits := bonus_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_100' limit 1), 20);
    bonus_sort := bonus_sort + 1;
  elsif share_count >= s2 then
    bonus_credits := bonus_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_reward_50' limit 1), 5);
  end if;

  if follower_count >= f5 then
    bonus_credits := bonus_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits' limit 1), 20);
    bonus_discovery := bonus_discovery + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_discovery' limit 1), 5);
    bonus_sort := bonus_sort + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_500_sort' limit 1), 1);
  elsif follower_count >= f3 then
    bonus_credits := bonus_credits + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits' limit 1), 5);
  elsif follower_count >= f2 then
    bonus_sort := bonus_sort + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_100_sort' limit 1), 1);
  elsif follower_count >= f1 then
    bonus_discovery := bonus_discovery + coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_25_discovery' limit 1), 3);
  end if;

  -- Déterminer le prochain palier de partages
  if share_count < 20 then
    next_goal := 20;
  elsif share_count < s2 then
    next_goal := s2;
  elsif share_count < s3 then
    next_goal := s3;
  else
    next_goal := null;
  end if;

  -- Audience Pro déverrouillé uniquement pour les plans payants ET >= seuil followers
  is_audience_pro_unlocked := (current_plan in ('CREATOR_PRO', 'VENUE_PRO', 'PREMIUM') and follower_count >= threshold);

  return query select
    share_count,
    follower_count,
    bonus_credits,
    bonus_discovery,
    bonus_sort,
    next_goal,
    is_audience_pro_unlocked,
    threshold;
end;
$function$;

-- Accorder l'accès à la fonction pour les utilisateurs authentifiés
grant execute on function public.keep_growth_reward_status() to authenticated;

-- Audit : cette fonction retourne les VRAIES données de croissance depuis la base de données.
-- Elle compte réellement les followers et partages qualifiés.
-- Elle NE DOIT PAS être utilisée pour valider des droits d'accès ou débloquer des fonctionnalités.
-- Les vérifications de plan doivent toujours se faire côté application via loadCurrentPlanCode().
