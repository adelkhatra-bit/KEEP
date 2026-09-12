-- KEEP — Fonctions manquantes pour le calcul des récompenses de croissance.
-- 1) keep_qualified_share_count(p_uid) : compte les keeps copiés depuis ce profil par d'autres.
-- 2) keep_growth_reward_status() : retourne le statut de récompense actuel de l'utilisateur (followers réels, partages, bonus).

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

revoke all on function public.keep_qualified_share_count(uuid) from public;
grant execute on function public.keep_qualified_share_count(uuid) to authenticated;

create or replace function public.keep_growth_reward_status()
returns table(qualified_shares integer, followers integer, bonus_free_credits integer, bonus_discovery_profiles integer, bonus_sort_trials integer, next_share_goal integer, audience_pro_unlocked boolean, audience_pro_threshold integer)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.keep_qualified_share_count(auth.uid())::integer as qualified_shares,
    (select count(*)::integer from public.follows where followee_id = auth.uid())::integer as followers,
    0::integer as bonus_free_credits,
    0::integer as bonus_discovery_profiles,
    0::integer as bonus_sort_trials,
    20::integer as next_share_goal,
    ((select count(*)::integer from public.follows where followee_id = auth.uid()) >= 1000)::boolean as audience_pro_unlocked,
    1000::integer as audience_pro_threshold;
$$;

revoke all on function public.keep_growth_reward_status() from public;
grant execute on function public.keep_growth_reward_status() to authenticated;
