-- KEEP — expose le vrai cout Free par GARDER (free_cost_per_keep, remote_config)
-- dans keep_download_credit_status(), pas seulement dans keep_consume_download_credit().
--
-- Audit Adel (11/09/2026, "il devrait dire solde insuffisant ... minimum
-- trois fruits") : free_cost_per_keep vaut reellement 3 (remote_config),
-- pas 1. Le controle serveur (keep_consume_download_credit) utilisait deja
-- la vraie valeur -- mais le statut consulte par le client (donc l'affichage
-- ET le verrou visuel du bouton Garder) ne l'exposait pas, et les deux
-- endroits cote mobile qui decidaient "assez de credit ?"
-- (ensureDownloadCreditAvailable, le nouveau verrou proactif de session)
-- comparaient au solde par rapport a un cout suppose de 1. Resultat prouve
-- en direct : a 1 ou 2 Free restants (donc reellement insuffisant pour le
-- vrai cout de 3), le bouton Garder restait affiche actif.
drop function if exists public.keep_download_credit_status();

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean, cost_per_keep integer)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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
  credit_limit:=used+remaining;
  cost_per_keep := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1), 1));
  return next;
end;
$function$;
