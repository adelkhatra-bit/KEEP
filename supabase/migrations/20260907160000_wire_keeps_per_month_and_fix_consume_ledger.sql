-- Adel 07/09/2026 : "ajoute un vrai plafond mensuel en plus" -- keeps_per_month
-- (deja configurable dans Super Admin, FREE=150 par defaut) etait un champ
-- decoratif, jamais lu par aucun code. Le branche maintenant comme un
-- DEUXIEME frein pour le Gratuit uniquement (en plus du solde de Free),
-- exactement comme prevu dans docs/PRICING_STRATEGY.md.
--
-- En le branchant, trouve une vraie incoherence laissee par la migration
-- 20260907153000 (unification de toutes les formules sur le meme grand
-- livre Free) : keep_download_credit_status() (lecture) a ete corrigee pour
-- que tout le monde passe par le grand livre cumulatif, mais
-- keep_consume_download_credit() (ecriture, appelee a chaque "Garder")
-- gardait encore un chemin separe base sur un compteur JOURNALIER
-- (feature_usage_counters) pour tout plan different de FREE -- ce compteur
-- repart a zero chaque jour, alors que le solde lu, lui, est cumulatif.
-- Resultat pour Premium/Createur Pro/Lieu Pro : la lecture et l'ecriture du
-- credit n'etaient plus alignees. Corrige : tout le monde (sauf invite) passe
-- desormais par le meme download_credit_usage cumulatif, sans distinction de
-- plan.

CREATE OR REPLACE FUNCTION public.keep_consume_download_credit()
 RETURNS TABLE(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  st record;
  used integer := 0;
  cost integer := 1;
  month_key text := to_char(now(),'YYYY-MM');
  monthly_cap integer;
  monthly_used integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  cost := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1), 1));
  select * into st from public.keep_download_credit_status();

  if st.unlimited then
    allowed := true;
    plan_code := st.plan_code;
    consumed := st.consumed;
    credit_limit := null;
    remaining := null;
    unlimited := true;
    return next;
    return;
  end if;

  if st.plan_code = 'FREE' then
    monthly_cap := public.keep_plan_limit('FREE','keeps_per_month');
    if monthly_cap is not null then
      insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
      values(uid,'KEEP_MONTHLY',month_key,0,now())
      on conflict(profile_id,feature_key,period_key) do nothing;

      select used_count into monthly_used from public.feature_usage_counters
      where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key
      for update;
      monthly_used := coalesce(monthly_used,0);

      if monthly_used >= monthly_cap then
        allowed := false;
        plan_code := st.plan_code;
        consumed := st.consumed;
        credit_limit := st.credit_limit;
        remaining := st.remaining;
        unlimited := false;
        return next;
        return;
      end if;
    end if;
  end if;

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, 0, now())
  on conflict(profile_id) do nothing;

  select d.consumed_count into used
  from public.download_credit_usage d
  where d.profile_id = uid
  for update;

  select * into st from public.keep_download_credit_status();
  used := greatest(used,st.consumed);
  if coalesce(st.remaining,0) < cost or used + cost > coalesce(st.credit_limit,0) then
    allowed := false;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := st.credit_limit;
    remaining := greatest(0,coalesce(st.remaining,0));
    unlimited := false;
    return next;
    return;
  end if;

  used := used + cost;
  update public.download_credit_usage
  set consumed_count=used,updated_at=now()
  where profile_id=uid;

  if st.plan_code = 'FREE' and monthly_cap is not null then
    update public.feature_usage_counters
    set used_count=monthly_used+1,updated_at=now()
    where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key;
  end if;

  allowed := true;
  plan_code := st.plan_code;
  consumed := used;
  credit_limit := st.credit_limit;
  remaining := greatest(0,st.credit_limit-used);
  unlimited := false;
  return next;
end;
$function$;
