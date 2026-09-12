-- Adel 07/09/2026 (confirme 3 fois de suite) : "tous les utilisateurs, meme
-- ceux qui auront un abonnement... le Free tous les fins de mois ils sont
-- recredites... si il reste des Free qui n'avaient pas ete utilises on lui
-- rajoute par-dessus" -- UN SEUL systeme de Free cumulatif pour TOUTES les
-- formules, jamais remis a zero, qui se recharge chaque mois. PREMIUM avait
-- encore son propre quota "40 par jour, remis a zero chaque jour" qui ignore
-- completement le grand livre mensuel (et donc les dons manuels admin, voir
-- audit du compte "inside" : 40 Free credites manuellement sans aucun effet).
-- CREATOR_PRO et VENUE_PRO avaient deja ete bascules sur le grand livre
-- (migration 20260907113000, fermeture du "illimite"). PREMIUM rejoint
-- maintenant exactement le meme systeme -- plus aucune formule n'a de quota
-- journalier separe.

CREATE OR REPLACE FUNCTION public.keep_download_credit_status()
 RETURNS TABLE(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 20;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
  reward record;
  reward_credits integer := 0;
  battle_adjustment integer := 0;
  monthly_bonus integer := 0;
  raw_limit integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  guest_limit := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='guest_success_limit' limit 1),3);
  signup_bonus := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='signup_bonus_successes' limit 1),20);
  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid),false);
  active_plan := public.keep_active_plan_code(uid);
  plan_code := active_plan; is_anonymous := anon;

  ledger_used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid),0);
  if anon then used:=ledger_used; reward_credits:=0; battle_adjustment:=0; monthly_bonus:=0;
  else
    derived_used := public.keep_chargeable_keep_count(uid);
    used := greatest(ledger_used,derived_used);
    if used>ledger_used then
      insert into public.download_credit_usage(profile_id,consumed_count,updated_at) values(uid,used,now())
      on conflict(profile_id) do update set consumed_count=greatest(public.download_credit_usage.consumed_count,excluded.consumed_count),updated_at=now();
    end if;
    select * into reward from public.keep_growth_reward_status();
    reward_credits := coalesce(reward.bonus_free_credits,0);
    battle_adjustment := public.keep_battle_credit_adjustment_for_profile(uid);
    monthly_bonus := public.keep_monthly_free_bonus_for_profile(uid);
  end if;

  raw_limit := case when anon then guest_limit else guest_limit+signup_bonus+reward_credits+battle_adjustment+monthly_bonus end;
  consumed:=used; unlimited:=false;
  remaining := case when anon then greatest(0,raw_limit-used) else public.keep_theoretical_free_credit_remaining_for_profile(uid) end;
  credit_limit:=used+remaining; return next;
end;
$function$;
