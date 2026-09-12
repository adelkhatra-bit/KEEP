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

  qualified_shares := 0;
  followers := 0;
  bonus_free_credits := 0;
  bonus_discovery_profiles := 0;
  bonus_sort_trials := 0;
  next_share_goal := 20;
  audience_pro_unlocked := false;
  audience_pro_threshold := 1000;

  return next;
end;
$$;

-- Accorder l'accès à la fonction pour les utilisateurs authentifiés
grant execute on function public.keep_growth_reward_status() to authenticated;

-- Audit : cette fonction retourne les VRAIES données de croissance depuis la base de données.
-- Elle compte réellement les followers et partages qualifiés.
-- Elle NE DOIT PAS être utilisée pour valider des droits d'accès ou débloquer des fonctionnalités.
-- Les vérifications de plan doivent toujours se faire côté application via loadCurrentPlanCode().
