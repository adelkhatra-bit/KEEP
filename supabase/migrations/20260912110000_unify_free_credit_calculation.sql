-- Adel (12/09/2026) : "Profil affiche 1 free, paramètres affichent 4 free"
-- Les deux RPC keep_battle_credit_status et keep_free_credit_breakdown
-- utilisent la même fonction source, donc les deux DEVRAIENT retourner
-- la même valeur. S'ils diffèrent, le bug est dans la logique du calcul.
--
-- Problème identifié: keep_theoretical_free_credit_remaining_for_profile()
-- utilise un calcul complexe avec greatest(used, capacity) qui peut retourner
-- des valeurs différentes selon l'ordre de traitement ou les conditions de cache.
--
-- Solution: Simplifier et rendre DÉTERMINISTE le calcul du solde Free.

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
  growth_bonus integer := 0;
  battle_adjustment integer := 0;
  monthly_bonus integer := 0;
  admin_grant integer := 0;
  total_earned integer := 0;
  total_used integer := 0;
  locked_arena integer := 0;
  remaining integer := 0;
  ledger_used integer := 0;
begin
  if p_uid is null then return 0; end if;

  -- Charger les paramètres de configuration
  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key = 'signup_bonus_successes' limit 1), 20);

  -- Calculer les bonuses de croissance
  growth_bonus := public.keep_growth_free_credit_bonus_for_profile(p_uid);

  -- Calculer les ajustements de battle (net: gagné - perdu)
  battle_adjustment := public.keep_battle_credit_adjustment_for_profile(p_uid);

  -- Calculer les bonus mensuels
  monthly_bonus := public.keep_monthly_free_bonus_for_profile(p_uid);

  -- Calculer les grants administrateur
  admin_grant := public.keep_admin_credit_grant_total_for_profile(p_uid);

  -- Calculer le TOTAL GAGNÉ
  -- guest_limit + signup + croissance + battles gagnés + bonus mensuels + admin grants positifs
  total_earned := greatest(0,
    guest_limit
    + signup_bonus
    + growth_bonus
    + greatest(battle_adjustment, 0)  -- Ajouter seulement les battles GAGNÉS
    + monthly_bonus
    + greatest(admin_grant, 0)
  );

  -- Calculer le TOTAL UTILISÉ
  -- Crédits utilisés via "Garder" + battles PERDUS + crédits retirés par admin
  ledger_used := coalesce((select consumed_count from public.download_credit_usage where profile_id = p_uid), 0);
  total_used := ledger_used + greatest(-battle_adjustment, 0) + greatest(-admin_grant, 0);

  -- Crédits verrouillés en arène
  locked_arena := coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id = p_uid and status = 'LOCKED'), 0);

  -- Calculer le SOLDE RESTANT
  remaining := greatest(0, total_earned - total_used - locked_arena);

  return remaining;
end;
$function$;

-- Vérification : les deux RPC doivent retourner EXACTEMENT la même valeur
comment on function public.keep_theoretical_free_credit_remaining_for_profile(uuid) is
  'Calcule le solde Free disponible. DÉTERMINISTE: deux appels pour le même utilisateur retournent TOUJOURS la même valeur.';
