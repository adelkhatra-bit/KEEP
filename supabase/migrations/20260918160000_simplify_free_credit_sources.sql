-- AUDIT CLARIFICATION (18/09/2026) : Les SEULES sources de Free autorisées
-- 1. Partage du profil (referrals)
-- 2. Résultats Loki Battle (SOLO/Arena/Duel)
-- 3. Formules payantes (plan_bonus)
--
-- À SUPPRIMER : guest_limit, signup_bonus, follower_bonus, admin_grant, monthly_bonus générique
-- Ces sources n'étaient pas autorisées et créaient de la confusion.

-- Update keep_free_credit_breakdown to include ONLY the 3 authorized sources
create or replace function public.keep_free_credit_breakdown()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  referral_bonus integer;
  referral_count integer;
  battle_adjustment integer;
  battle_won integer;
  battle_lost integer;
  used integer;
  locked_arena integer;
  remaining integer;
  recent_battles jsonb;
  plan_bonus integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Source 1: Referral bonus (from partage du profil)
  referral_bonus := public.keep_referral_free_credit_bonus_for_profile(uid);
  select count(*)::integer into referral_count from public.keep_referrals where referrer_profile_id=uid;

  -- Source 2: Battle adjustment (from Loki Battle results)
  select coalesce(sum(amount) filter (where amount > 0), 0)::integer,
         coalesce(abs(sum(amount) filter (where amount < 0)), 0)::integer,
         coalesce(sum(amount), 0)::integer
  into battle_won, battle_lost, battle_adjustment
  from (
    select amount from public.keep_battle_credit_events where profile_id = uid
    union all
    select amount from public.keep_battle_arena_credit_events where profile_id = uid
    union all
    select amount from public.keep_battle_solo_credit_events where profile_id = uid
  ) e;

  -- Source 3: Plan bonus (from paid formulas)
  plan_bonus := public.keep_monthly_free_bonus_for_profile(uid);

  used := greatest(coalesce((select consumed_count from public.download_credit_usage where profile_id=uid),0), public.keep_chargeable_keep_count(uid));
  locked_arena := coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id=uid and status='LOCKED'),0);
  remaining := public.keep_theoretical_free_credit_remaining_for_profile(uid);

  select coalesce(jsonb_agg(jsonb_build_object('result',x.result,'amount',x.amount,'createdAt',x.created_at,'themeCode',x.theme_code,'battleType',x.battle_type) order by x.created_at desc),'[]'::jsonb)
  into recent_battles
  from (
    (select e.result,e.amount,e.created_at,a.theme_code,'ARENA'::text as battle_type from public.keep_battle_arena_credit_events e join public.keep_battle_arenas a on a.id=e.arena_id where e.profile_id=uid order by e.created_at desc limit 15)
    union all
    (select e.result,e.amount,e.created_at,null::text as theme_code,'DUEL'::text as battle_type from public.keep_battle_credit_events e where e.profile_id=uid order by e.created_at desc limit 15)
    union all
    (select e.result,e.amount,e.created_at,h.theme_code,'SOLO'::text as battle_type from public.keep_battle_solo_credit_events e join public.keep_battle_solo_history h on h.id=e.history_id where e.profile_id=uid order by e.created_at desc limit 15)
  ) x
  order by x.created_at desc
  limit 15;

  return jsonb_build_object(
    'remaining',remaining,
    'referralBonus',referral_bonus,'referralCount',referral_count,
    'battleAdjustment',battle_adjustment,
    'battleWon',battle_won,
    'battleLost',battle_lost,
    'planBonus',plan_bonus,
    'used',used,
    'lockedArena',locked_arena,
    'recentBattles',recent_battles
  );
end;
$function$;

-- Update keep_theoretical_free_credit_remaining_for_profile to include ONLY the 3 sources
create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public',auth
as $$
declare
  growth_bonus integer := 0;
  referral_bonus integer := 0;
  battle_adjustment integer := 0;
  plan_bonus integer := 0;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  capacity integer := 0;
begin
  if p_uid is null then return 0; end if;

  -- Source 1: Referral bonus
  referral_bonus := public.keep_referral_free_credit_bonus_for_profile(p_uid);

  -- Source 2: Battle adjustment
  battle_adjustment := coalesce((select sum(amount)::integer from public.keep_battle_credit_events where profile_id=p_uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_arena_credit_events where profile_id=p_uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_solo_credit_events where profile_id=p_uid),0);

  -- Source 3: Plan bonus
  plan_bonus := public.keep_monthly_free_bonus_for_profile(p_uid);

  ledger_used := coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used := public.keep_chargeable_keep_count(p_uid);
  used := greatest(ledger_used,derived_used);
  capacity := greatest(used, referral_bonus + battle_adjustment + plan_bonus);
  return greatest(0, capacity-used);
end;
$$;
