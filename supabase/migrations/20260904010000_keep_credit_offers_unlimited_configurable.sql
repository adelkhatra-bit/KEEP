-- Adel (04/09/2026) : "sur Offres et Credit, la ou c'est marque illimite,
-- je veux pouvoir le modifier illimite ou limite ... si tu l'as mis dans le
-- dur ca va etre complique" -- AUDIT confirme en lisant le code live :
-- keep_download_credit_status codait en dur "CREATOR_PRO et VENUE_PRO sont
-- TOUJOURS illimites", sans lien avec la grille "Limites par formule" deja
-- existante -- aucun moyen de changer ca sans toucher au code. Meme
-- probleme sur keep_event_creation_status : "illimite" n'etait vrai QUE
-- pour VENUE_PRO precisement (meme si un admin mettait un vrai chiffre pour
-- VENUE_PRO dans la grille, il etait ignore ; et si un admin videait la
-- case pour CREATOR_PRO en pensant "illimite" comme partout ailleurs, ca
-- bloquait au contraire TOUTES les creations d'evenement pour ce plan).
--
-- Fix : les deux fonctions suivent maintenant la MEME convention que
-- partout ailleurs dans Super Admin -- "Limites par formule" vide = illimite,
-- un chiffre = plafond reel -- pour TOUTES les formules payantes, sans plus
-- jamais nommer un plan precis dans le code.
create or replace function public.keep_download_credit_status()
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

  if active_plan <> 'FREE' then
    -- Adel : "illimite ou limite, je veux pouvoir le modifier" -- vide dans
    -- Limites par formule (downloads_per_day) = illimite pour CETTE formule,
    -- un chiffre = plafond journalier reel. Aucune formule n'est plus
    -- jamais forcee illimitee par son nom dans le code.
    daily_limit := public.keep_plan_limit(active_plan,'downloads_per_day');
    if daily_limit is null then
      consumed:=0; credit_limit:=null; remaining:=null; unlimited:=true; return next; return;
    end if;
    select coalesce(used_count,0) into used from public.feature_usage_counters where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key;
    used:=coalesce(used,0); consumed:=used; credit_limit:=daily_limit; remaining:=greatest(daily_limit-used,0); unlimited:=false; return next; return;
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
  consumed:=used; unlimited:=false; credit_limit:=greatest(used,raw_limit); remaining:=greatest(0,credit_limit-used); return next;
end;
$function$;

create or replace function public.keep_event_creation_status()
 RETURNS TABLE(plan_code text, allowed boolean, used integer, limit_value integer, remaining integer, unlimited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  plan text;
  lim integer;
  cnt integer;
  follower_count integer := 0;
  override integer;
  min_followers integer := 500;
  month_start timestamptz := date_trunc('month', now());
begin
  if uid is null then raise exception 'authentication_required'; end if;
  plan := public.keep_active_plan_code(uid);
  lim := public.keep_plan_limit(plan, 'events_per_month');

  select count(*)::integer into cnt
  from public.events
  where creator_id = uid and created_at >= month_start;

  select count(*)::integer into follower_count
  from public.follows
  where followee_id = uid;

  select p.follower_count_override into override from public.profiles p where p.id = uid;
  if override is not null then follower_count := override; end if;

  select coalesce((value #>> '{}')::integer, 500)
    into min_followers
  from public.remote_config
  where key = 'growth_followers_tier4_threshold';
  min_followers := coalesce(min_followers, 500);

  plan_code := plan;
  used := cnt;
  limit_value := lim;
  -- Adel : "illimite ou limite, je veux pouvoir le modifier" -- vide dans
  -- Limites par formule (events_per_month) = illimite pour CETTE formule,
  -- quelle qu'elle soit ; un chiffre = plafond mensuel reel, meme pour
  -- VENUE_PRO. Avant : "illimite" etait vrai UNIQUEMENT si plan=VENUE_PRO,
  -- ce qui a) ignorait un vrai plafond tape pour VENUE_PRO et b) bloquait
  -- totalement la creation d'evenement pour toute AUTRE formule dont la
  -- case avait ete videe en pensant "illimite" comme partout ailleurs.
  unlimited := lim is null;
  allowed := follower_count >= min_followers and (unlimited or cnt < coalesce(lim, 0));
  remaining := case when unlimited then null else greatest(coalesce(lim, 0) - cnt, 0) end;
  return next;
end;
$function$;
