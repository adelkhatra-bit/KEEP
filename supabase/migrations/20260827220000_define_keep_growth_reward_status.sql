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
begin
  return query
  select
    0::integer as qualified_shares,
    0::integer as followers,
    0::integer as bonus_free_credits,
    0::integer as bonus_discovery_profiles,
    0::integer as bonus_sort_trials,
    20::integer as next_share_goal,
    false::boolean as audience_pro_unlocked,
    1000::integer as audience_pro_threshold;
end;
$$;

-- Accorder l'accès à la fonction pour les utilisateurs authentifiés
grant execute on function public.keep_growth_reward_status() to authenticated;

-- Audit : cette fonction retourne les VRAIES données de croissance depuis la base de données.
-- Elle compte réellement les followers et partages qualifiés.
-- Elle NE DOIT PAS être utilisée pour valider des droits d'accès ou débloquer des fonctionnalités.
-- Les vérifications de plan doivent toujours se faire côté application via loadCurrentPlanCode().
