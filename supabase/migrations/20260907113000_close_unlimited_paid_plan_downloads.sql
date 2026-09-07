-- Adel 07/09/2026 : "meme ceux qui auront un abonnement avec la pastille, ils
-- auront un systeme de Free obligatoire par mois pour eviter les abus".
-- Audit confirme en direct : keep_download_credit_status() renvoie
-- unlimited:=true des qu'un plan n'a pas de downloads_per_day configure --
-- aujourd'hui CREATOR_PRO et VENUE_PRO (usage_limits.downloads_per_day = null
-- pour les deux). Ces abonnes ont donc un Free reellement infini, jamais
-- compte, alors meme que le grand livre mensuel (monthly_free_credit_awards,
-- Free/mois configure dans Super Admin > Offres : CREATOR_PRO=40, VENUE_PRO=100)
-- existe deja pour eux.
--
-- Fix : seul un plan avec un downloads_per_day EXPLICITEMENT configure
-- (PREMIUM=40/jour aujourd'hui) garde ce quota journalier -- comportement
-- inchange, ce n'etait pas casse. Tout le reste (FREE, et desormais tout plan
-- payant sans quota journalier explicite) passe par le meme grand livre Free
-- cumulatif que tout le monde. Aucun utilisateur ne peut plus etre "illimite".

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
  daily_limit integer;
  day_key text := to_char(current_date,'YYYY-MM-DD');
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

  if active_plan <> 'FREE' and not anon then
    daily_limit := public.keep_plan_limit(active_plan,'downloads_per_day');
    if daily_limit is not null then
      select coalesce(used_count,0) into used from public.feature_usage_counters where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key;
      used:=coalesce(used,0); consumed:=used; credit_limit:=daily_limit; remaining:=greatest(daily_limit-used,0); unlimited:=false; return next; return;
    end if;
  end if;

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
