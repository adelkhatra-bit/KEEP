-- Unifie l'ancien Battle duel et les arènes actuelles dans une seule
-- comptabilité Free. Les écrans utilisateur et Super Admin s'appuient déjà
-- sur keep_theoretical_free_credit_remaining_for_profile : corriger cette
-- fonction source corrige donc tous les soldes sans double écriture.
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
  ) e;
$function$;

create or replace function public.keep_battle_credit_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  won integer := 0;
  lost integer := 0;
  net integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select
    coalesce(sum(amount) filter (where amount > 0), 0)::integer,
    coalesce(abs(sum(amount) filter (where amount < 0)), 0)::integer,
    coalesce(sum(amount), 0)::integer
  into won, lost, net
  from (
    select amount from public.keep_battle_credit_events where profile_id = uid
    union all
    select amount from public.keep_battle_arena_credit_events where profile_id = uid
  ) e;
  return jsonb_build_object(
    'won', won,
    'lost', lost,
    'net', net,
    'remainingFree', public.keep_theoretical_free_credit_remaining_for_profile(uid)
  );
end;
$function$;

create or replace function public.keep_battle_profile_battle_stats(p_profile_id uuid, p_theme_limit integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if p_profile_id is null then raise exception 'PROFILE_REQUIRED'; end if;
  if uid is distinct from p_profile_id and not exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.is_public = true
  ) then
    raise exception 'PROFILE_NOT_PUBLIC';
  end if;

  with mine as (
    select r.*, a.theme_code
    from public.keep_battle_arena_match_results r
    join public.keep_battle_arenas a on a.id = r.arena_id
    where r.profile_id = p_profile_id
  ), totals as (
    select count(*) filter (where placement = 1) as wins,
      count(*) as matches_played,
      coalesce(sum(score), 0) as total_score,
      coalesce(sum(correct_predictions), 0) as total_correct,
      case when sum(correct_predictions) > 0 then
        (sum(total_response_ms) / greatest(1, sum(correct_predictions)))::integer
      else null end as avg_response_ms
    from mine
  ), by_theme as (
    select theme_code, count(*) filter (where placement = 1) as wins, count(*) as matches
    from mine group by theme_code
    order by wins desc, matches desc
    limit greatest(1, least(coalesce(p_theme_limit, 3), 10))
  ), credit as (
    select
      coalesce(sum(amount) filter (where amount > 0), 0)::integer as free_won,
      coalesce(abs(sum(amount) filter (where amount < 0)), 0)::integer as free_lost,
      coalesce(sum(amount), 0)::integer as free_net
    from (
      select amount from public.keep_battle_credit_events where profile_id = p_profile_id
      union all
      select amount from public.keep_battle_arena_credit_events where profile_id = p_profile_id
    ) e
  )
  select jsonb_build_object(
    'wins', (select wins from totals),
    'matchesPlayed', (select matches_played from totals),
    'totalScore', (select total_score from totals),
    'totalCorrect', (select total_correct from totals),
    'avgResponseMs', (select avg_response_ms from totals),
    'topThemes', coalesce((select jsonb_agg(jsonb_build_object('themeCode', theme_code, 'wins', wins, 'matches', matches)) from by_theme), '[]'::jsonb),
    'followers', (select count(*)::integer from public.follows f where f.followee_id = p_profile_id),
    'freeBalance', public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id),
    'freeWon', (select free_won from credit),
    'freeLost', (select free_lost from credit),
    'freeNet', (select free_net from credit)
  ) into result;
  return result;
end;
$function$;

create or replace function public.keep_free_credit_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  guest_limit integer; signup_bonus integer; follower_count integer;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  follower_bonus integer; referral_bonus integer; referral_count integer;
  monthly_bonus integer; admin_grant integer; battle_adjustment integer;
  battle_won integer; battle_lost integer; used integer; locked_arena integer;
  remaining integer; total_earned integer; total_spent integer; recent_battles jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1), 20);
  select count(*)::integer into follower_count from public.follows where followee_id = uid;
  f3 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'), 250);
  f5 := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'), 1000);
  f250c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'), 5);
  f1000c := coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'), 20);
  follower_bonus := (case when follower_count >= f3 then f250c else 0 end) + (case when follower_count >= f5 then f1000c else 0 end);
  referral_bonus := public.keep_referral_free_credit_bonus_for_profile(uid);
  select count(*)::integer into referral_count from public.keep_referrals where referrer_profile_id = uid;
  monthly_bonus := public.keep_monthly_free_bonus_for_profile(uid);
  admin_grant := public.keep_admin_credit_grant_total_for_profile(uid);
  battle_adjustment := public.keep_battle_credit_adjustment_for_profile(uid);
  select coalesce(sum(amount) filter (where amount > 0), 0)::integer,
         coalesce(abs(sum(amount) filter (where amount < 0)), 0)::integer
  into battle_won, battle_lost
  from (
    select amount from public.keep_battle_credit_events where profile_id = uid
    union all
    select amount from public.keep_battle_arena_credit_events where profile_id = uid
  ) e;
  used := greatest(coalesce((select consumed_count from public.download_credit_usage where profile_id = uid), 0), public.keep_chargeable_keep_count(uid));
  locked_arena := coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id = uid and status = 'LOCKED'), 0);
  remaining := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  total_earned := guest_limit + signup_bonus + follower_bonus + referral_bonus + monthly_bonus + greatest(admin_grant, 0) + battle_won;
  total_spent := used + battle_lost + greatest(-admin_grant, 0);

  select coalesce(jsonb_agg(jsonb_build_object('result', x.result, 'amount', x.amount, 'createdAt', x.created_at, 'themeCode', x.theme_code) order by x.created_at desc), '[]'::jsonb)
  into recent_battles
  from (
    select * from (
      select e.result, e.amount, e.created_at, a.theme_code
      from public.keep_battle_arena_credit_events e
      join public.keep_battle_arenas a on a.id = e.arena_id
      where e.profile_id = uid order by e.created_at desc limit 15
    ) arena_events
    union all
    select * from (
      select e.result, e.amount, e.created_at, null::text as theme_code
      from public.keep_battle_credit_events e
      where e.profile_id = uid order by e.created_at desc limit 15
    ) duel_events
    order by created_at desc limit 15
  ) x;

  return jsonb_build_object(
    'remaining', remaining, 'guestLimit', guest_limit, 'signupBonus', signup_bonus,
    'followerCount', follower_count, 'followerBonus', follower_bonus,
    'followerTier3', f3, 'followerTier5', f5,
    'referralBonus', referral_bonus, 'referralCount', referral_count,
    'monthlyBonus', monthly_bonus, 'adminGrant', admin_grant,
    'battleAdjustment', battle_adjustment, 'battleWon', battle_won,
    'battleLost', battle_lost, 'totalEarned', total_earned,
    'totalSpent', total_spent, 'used', used, 'lockedArena', locked_arena,
    'recentBattles', recent_battles
  );
end;
$function$;

revoke all on function public.keep_battle_credit_adjustment_for_profile(uuid) from public, anon, authenticated;
revoke all on function public.keep_battle_credit_status() from public, anon;
grant execute on function public.keep_battle_credit_status() to authenticated;
revoke all on function public.keep_free_credit_breakdown() from public, anon;
grant execute on function public.keep_free_credit_breakdown() to authenticated;
revoke all on function public.keep_battle_profile_battle_stats(uuid, integer) from public;
grant execute on function public.keep_battle_profile_battle_stats(uuid, integer) to anon, authenticated;
