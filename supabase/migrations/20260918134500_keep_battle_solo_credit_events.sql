-- Track and credit users for SOLO battle wins/losses
-- Uses keep_battle_solo_credit_events linked to SOLO history
-- Rewards scale with SOLO pack size: 8→3 Free max, 15→6, 20→8, 30→12

create table if not exists public.keep_battle_solo_credit_events (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.keep_battle_solo_history(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('WIN','LOSS')),
  amount integer not null check (amount <> 0),
  created_at timestamptz not null default now(),
  unique (history_id, profile_id)
);

create index if not exists idx_keep_battle_solo_credit_events_profile_created
  on public.keep_battle_solo_credit_events(profile_id, created_at desc);

alter table public.keep_battle_solo_credit_events enable row level security;
revoke all on public.keep_battle_solo_credit_events from anon, authenticated;

-- Helper: max Free reward for SOLO pack size
-- 8 questions → 3 Free max
-- 15 questions → 6 Free max
-- 20 questions → 8 Free max
-- 30 questions → 12 Free max
create or replace function public.keep_battle_solo_max_reward_for_round_count(p_round_count integer)
returns integer
language sql
immutable
as $$
  select case
    when p_round_count is null or p_round_count <= 0 then 0
    when p_round_count <= 8 then 3
    when p_round_count <= 15 then 6
    when p_round_count <= 20 then 8
    else 12
  end;
$$;

-- Update keep_battle_solo_report_result() to credit users based on score
-- Formula: Free earned = floor(correct_answers / total * max_reward_for_pack_size)
create or replace function public.keep_battle_solo_report_result(p_correct integer, p_total integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  total integer;
  correct integer;
  free_earned integer;
  max_reward integer;
  history_record record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_total is null or p_total <= 0 then return; end if;

  total := least(p_total, 30);
  correct := least(greatest(0, coalesce(p_correct, 0)), total);

  -- Update skill stats as before
  insert into public.keep_battle_skill_stats(profile_id, solo_correct, solo_total, updated_at)
  values (uid, correct, total, now())
  on conflict (profile_id) do update set
    solo_correct = keep_battle_skill_stats.solo_correct + correct,
    solo_total = keep_battle_skill_stats.solo_total + total,
    updated_at = now();

  -- Get max reward for this pack size, then calculate earned based on correctness
  max_reward := public.keep_battle_solo_max_reward_for_round_count(total);
  free_earned := floor(correct::numeric / total * max_reward)::integer;

  -- Find the most recent uncredited SOLO match for this user
  select h.id into history_record.id from public.keep_battle_solo_history h
  where h.profile_id = uid
    and h.completed_at >= now() - interval '5 minutes'
  order by h.completed_at desc
  limit 1;

  -- If we found a recent match and free_earned is positive, credit the user
  if history_record.id is not null and free_earned > 0 then
    insert into public.keep_battle_solo_credit_events(history_id, profile_id, result, amount)
    values (history_record.id, uid, 'WIN', free_earned)
    on conflict (history_id, profile_id) do nothing;
  end if;
end;
$function$;

-- Update keep_free_credit_breakdown to include SOLO credit events
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

  -- Calculate battle_adjustment from all battle credit sources: regular battles, ARENA, and SOLO
  battle_adjustment := coalesce((select sum(amount)::integer from public.keep_battle_credit_events where profile_id=uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_arena_credit_events where profile_id=uid),0) +
                      coalesce((select sum(amount)::integer from public.keep_battle_solo_credit_events where profile_id=uid),0);

  used := greatest(coalesce((select consumed_count from public.download_credit_usage where profile_id=uid),0), public.keep_chargeable_keep_count(uid));
  locked_arena := coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id=uid and status='LOCKED'),0);
  remaining := public.keep_theoretical_free_credit_remaining_for_profile(uid);

  select coalesce(jsonb_agg(jsonb_build_object('result',x.result,'amount',x.amount,'createdAt',x.created_at,'themeCode',x.theme_code) order by x.created_at desc),'[]'::jsonb)
  into recent_battles
  from (
    (select e.result,e.amount,e.created_at,a.theme_code from public.keep_battle_arena_credit_events e join public.keep_battle_arenas a on a.id=e.arena_id where e.profile_id=uid order by e.created_at desc limit 15)
    union all
    (select e.result,e.amount,e.created_at,null::text as theme_code from public.keep_battle_credit_events e where e.profile_id=uid order by e.created_at desc limit 15)
    union all
    (select e.result,e.amount,e.created_at,h.theme_code from public.keep_battle_solo_credit_events e join public.keep_battle_solo_history h on h.id=e.history_id where e.profile_id=uid order by e.created_at desc limit 15)
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
    'used',used,
    'lockedArena',locked_arena,
    'recentBattles',recent_battles
  );
end;
$function$;

-- Update keep_theoretical_free_credit_remaining_for_profile to include SOLO credit events
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
