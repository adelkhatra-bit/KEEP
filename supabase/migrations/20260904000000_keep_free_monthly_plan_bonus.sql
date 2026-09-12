-- Adel (03-04/09/2026) : "une fois que le client il a plus de Free, il
-- faudra qu'il attende au moins un mois pour que son credit remonte ... et
-- attention, il faut mettre le nombre de Free que les differentes formules
-- auront." Nouveau palier mensuel PAR PLAN, entierement pilotable depuis le
-- Super Admin (remote-config.tsx affiche deja n'importe quelle ligne de
-- remote_config -- ces 4 cles y apparaissent automatiquement, groupees avec
-- "Essai, credits & limites").
--
-- Regle : chaque mois PLEIN ecoule depuis la creation du profil, le compte
-- accumule +N Free (N depend du plan actif au moment du calcul). Purement
-- additif -- ne touche jamais aux compteurs "consommes" existants, ne peut
-- donc jamais retirer un Free deja acquis ni casser le calcul actuel.
insert into public.remote_config(key, value, description)
values
  ('free_monthly_bonus_free', '5'::jsonb, 'Free offerts chaque mois écoulé, formule Free.'),
  ('free_monthly_bonus_premium', '15'::jsonb, 'Free offerts chaque mois écoulé, formule Premium (2,99€).'),
  ('free_monthly_bonus_creator_pro', '40'::jsonb, 'Free offerts chaque mois écoulé, formule Creator Pro (9,99€).'),
  ('free_monthly_bonus_venue_pro', '100'::jsonb, 'Free offerts chaque mois écoulé, formule Venue Pro (29,99€).')
on conflict (key) do nothing;

create or replace function public.keep_monthly_free_bonus_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_plan text;
  v_key text;
  v_amount integer := 0;
  v_created_at timestamptz;
  v_months integer := 0;
begin
  if p_uid is null then return 0; end if;
  v_plan := public.keep_active_plan_code(p_uid);
  v_key := case v_plan
    when 'PREMIUM' then 'free_monthly_bonus_premium'
    when 'CREATOR_PRO' then 'free_monthly_bonus_creator_pro'
    when 'VENUE_PRO' then 'free_monthly_bonus_venue_pro'
    else 'free_monthly_bonus_free'
  end;
  v_amount := coalesce((select (value #>> '{}')::integer from public.remote_config where key = v_key limit 1), 0);
  select created_at into v_created_at from public.profiles where id = p_uid;
  if v_created_at is null then return 0; end if;
  v_months := greatest(0, floor(extract(epoch from (now() - v_created_at)) / (30 * 86400))::integer);
  return v_amount * v_months;
end;
$function$;

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer:=3;
  signup_bonus integer:=20;
  growth_bonus integer:=0;
  battle_adjustment integer:=0;
  monthly_bonus integer:=0;
  ledger_used integer:=0;
  derived_used integer:=0;
  used integer:=0;
  capacity integer:=0;
  locked_arena integer:=0;
begin
  if p_uid is null then return 0; end if;
  guest_limit:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);
  growth_bonus:=public.keep_growth_free_credit_bonus_for_profile(p_uid);
  battle_adjustment:=public.keep_battle_credit_adjustment_for_profile(p_uid);
  monthly_bonus:=public.keep_monthly_free_bonus_for_profile(p_uid);
  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used);
  capacity:=greatest(used,guest_limit+signup_bonus+growth_bonus+battle_adjustment+monthly_bonus);
  locked_arena:=coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id=p_uid and status='LOCKED'),0);
  return greatest(0,capacity-used-locked_arena);
end;
$function$;

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
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
  daily_limit integer := 40;
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

  if active_plan in ('CREATOR_PRO','VENUE_PRO') then consumed:=0; credit_limit:=null; remaining:=null; unlimited:=true; return next; return; end if;
  if active_plan='PREMIUM' then
    daily_limit := coalesce(public.keep_plan_limit('PREMIUM','downloads_per_day'),40);
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
