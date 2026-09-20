-- AUDIT LOGGING AUTO (19/09/2026)
-- Ajouter le logging automatique à chaque appel de keep_free_credit_breakdown
-- pour que chaque calcul de Free soit tracé dans free_credit_audit_log

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

  -- LOG AUDIT: Tracer ce calcul de Free
  perform public.free_credit_log_balance_calculated(
    p_profile_id := uid,
    p_remaining_free := remaining,
    p_guest_limit := guest_limit,
    p_signup_bonus := signup_bonus,
    p_follower_bonus := follower_bonus,
    p_referral_bonus := referral_bonus,
    p_monthly_bonus := monthly_bonus,
    p_admin_grant := admin_grant,
    p_battle_adjustment := battle_adjustment,
    p_used := used,
    p_locked_arena := locked_arena,
    p_calculation_method := 'BREAKDOWN_RPC'
  );

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

-- Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
-- Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
