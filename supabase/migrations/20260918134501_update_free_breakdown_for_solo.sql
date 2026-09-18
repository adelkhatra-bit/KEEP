-- AUDIT FIX (18/09/2026) : Met à jour keep_free_credit_breakdown et
-- keep_battle_credit_adjustment_for_profile pour inclure les SOLO credit
-- events. Les SOLO gagnés doivent maintenant être visibles dans le breakdown
-- et comptabilisés correctement dans le solde théorique.

-- Update keep_battle_credit_adjustment_for_profile to include SOLO
create or replace function public.keep_battle_credit_adjustment_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(e.amount), 0)::integer
  from (
    select amount from public.keep_battle_credit_events where profile_id = p_uid
    union all
    select amount from public.keep_battle_arena_credit_events where profile_id = p_uid
    union all
    select amount from public.keep_battle_solo_credit_events where profile_id = p_uid
  ) e;
$function$;

-- Update keep_free_credit_breakdown to include SOLO in recent_battles
create or replace function public.keep_free_credit_breakdown()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  guest_limit integer;
  signup_bonus integer;
  follower_count integer;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  follower_bonus integer;
  referral_bonus integer;
  referral_count integer;
  monthly_bonus integer;
  admin_grant integer;
  battle_adjustment integer;
  battle_won integer;
  battle_lost integer;
  used integer;
  locked_arena integer;
  remaining integer;
  recent_battles jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);

  select count(*)::integer into follower_count from public.follows where followee_id=uid;
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
  follower_bonus := (case when follower_count>=f3 then f250c else 0 end) + (case when follower_count>=f5 then f1000c else 0 end);

  referral_bonus := public.keep_referral_free_credit_bonus_for_profile(uid);
  select count(*)::integer into referral_count from public.keep_referrals where referrer_profile_id=uid;
  monthly_bonus := public.keep_monthly_free_bonus_for_profile(uid);
  admin_grant := public.keep_admin_credit_grant_total_for_profile(uid);

  -- Calculate battle_adjustment and separate won/lost from all battle credit sources
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
    'guestLimit',guest_limit,
    'signupBonus',signup_bonus,
    'followerCount',follower_count,
    'followerBonus',follower_bonus,
    'followerTier3',f3,'followerTier5',f5,
    'referralBonus',referral_bonus,'referralCount',referral_count,
    'monthlyBonus',monthly_bonus,
    'adminGrant',admin_grant,
    'battleAdjustment',battle_adjustment,
    'battleWon',battle_won,
    'battleLost',battle_lost,
    'used',used,
    'lockedArena',locked_arena,
    'recentBattles',recent_battles
  );
end;
$function$;

-- Update keep_theoretical_free_credit_remaining_for_profile to include SOLO
create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public',auth
as $$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
  growth_bonus integer := 0;
  battle_adjustment integer := 0;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  capacity integer := 0;
begin
  if p_uid is null then return 0; end if;
  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);
  growth_bonus := public.keep_growth_free_credit_bonus_for_profile(p_uid);

  -- Include SOLO credit events in battle_adjustment calculation
  battle_adjustment := coalesce((select sum(amount)::integer from public.keep_battle_credit_events where profile_id=p_uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_arena_credit_events where profile_id=p_uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_solo_credit_events where profile_id=p_uid),0);

  ledger_used := coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used := public.keep_chargeable_keep_count(p_uid);
  used := greatest(ledger_used,derived_used);
  capacity := greatest(used, guest_limit + signup_bonus + growth_bonus + battle_adjustment);
  return greatest(0, capacity-used);
end;
$$;

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
