-- KEEP FREE credits are a history of successful paid/quota-consuming actions.
-- Deleting/hiding/removing a track must never refund a previously consumed
-- FREE credit. The ledger may be repaired upward from historical KEEP data,
-- but must never be recalculated downward from the current library size.

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
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='signup_bonus_successes' limit 1), 20);
  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid), false);
  active_plan := public.keep_active_plan_code(uid);
  plan_code := active_plan;
  is_anonymous := anon;

  if active_plan in ('CREATOR_PRO','VENUE_PRO') then
    consumed := 0;
    credit_limit := null;
    remaining := null;
    unlimited := true;
    return next;
    return;
  end if;

  if active_plan = 'PREMIUM' then
    daily_limit := coalesce(public.keep_plan_limit('PREMIUM','downloads_per_day'),40);
    select coalesce(used_count,0) into used
    from public.feature_usage_counters
    where profile_id=uid and feature_key='DOWNLOAD' and period_key=day_key;
    used := coalesce(used,0);
    consumed := used;
    credit_limit := daily_limit;
    remaining := greatest(daily_limit-used,0);
    unlimited := false;
    return next;
    return;
  end if;

  ledger_used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid), 0);
  if anon then
    used := ledger_used;
    reward_credits := 0;
  else
    derived_used := public.keep_chargeable_keep_count(uid);
    used := greatest(ledger_used, derived_used);
    if used > ledger_used then
      insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
      values(uid, used, now())
      on conflict(profile_id) do update
      set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
          updated_at = now();
    end if;
    select * into reward from public.keep_growth_reward_status();
    reward_credits := coalesce(reward.bonus_free_credits,0);
  end if;

  consumed := used;
  unlimited := false;
  credit_limit := case when anon then guest_limit else guest_limit + signup_bonus + reward_credits end;
  remaining := greatest(0, credit_limit - used);
  return next;
end;
$function$;

create or replace function public.keep_mark_social_origin(
  p_decision_id uuid,
  p_source_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  target_track uuid;
  existing_source uuid;
  existing_type text;
  current_used integer := 0;
  next_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_source_profile_id is null or p_source_profile_id = uid then raise exception 'invalid_social_origin'; end if;

  select kd.track_id, kd.source_user_id, kd.source_type
    into target_track, existing_source, existing_type
  from public.keep_decisions kd
  where kd.id = p_decision_id
    and kd.profile_id = uid
    and kd.decision = 'KEPT';

  if target_track is null then raise exception 'decision_not_found'; end if;

  current_used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid), 0);
  next_count := greatest(current_used, public.keep_chargeable_keep_count(uid));
  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, next_count, now())
  on conflict(profile_id) do update
  set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'decisionId', p_decision_id,
    'sourceProfileId', existing_source,
    'sourceType', existing_type,
    'preserved', true,
    'chargeableKeeps', public.keep_chargeable_keep_count(uid),
    'consumedCredits', next_count
  );
end;
$function$;

revoke all on function public.keep_download_credit_status() from public;
revoke all on function public.keep_mark_social_origin(uuid, uuid) from public;
grant execute on function public.keep_download_credit_status() to authenticated;
grant execute on function public.keep_mark_social_origin(uuid, uuid) to authenticated;
