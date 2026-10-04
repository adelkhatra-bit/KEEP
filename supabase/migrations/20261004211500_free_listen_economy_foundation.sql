-- ECONOMIE FREE 04/10/2026 — server-authoritative listen quota + additive rewards.
-- Single source of truth remains keep_theoretical_free_credit_remaining_for_profile().
-- Existing accounts keep their historical signup/referral entitlement; new rules are prospective.

-- Canonical configurable values. Old keys remain for grandfathered accounts.
insert into public.remote_config(key,value) values
  ('guest_listen_total_limit','3'::jsonb),
  ('signup_bonus_free_new_accounts','5'::jsonb),
  ('listen_over_quota_free_cost','1'::jsonb),
  ('referral_v2_free_per_signup','2'::jsonb),
  ('referral_v2_monthly_free_cap','20'::jsonb),
  ('first_discovery_free_per_keep','1'::jsonb),
  ('first_discovery_monthly_free_cap','20'::jsonb),
  ('listen_streak_daily_free','1'::jsonb),
  ('listen_streak_day7_bonus_free','5'::jsonb),
  ('listen_streak_paid_freeze_per_month','1'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

-- Daily successful-listen quotas by plan.
insert into public.usage_limits(plan_id,limit_key,limit_value)
select p.id,'listens_per_day',v.limit_value
from (values
  ('FREE'::text,5),
  ('PREMIUM'::text,30),
  ('CREATOR_PRO'::text,60),
  ('VENUE_PRO'::text,150)
) v(plan_code,limit_value)
join public.plans p on p.code::text=v.plan_code
on conflict(plan_id,limit_key) do update set limit_value=excluded.limit_value;

-- Additive FREE event ledger. It does not replace the wallet; the canonical balance
-- function below aggregates it alongside the existing battle/monthly/admin ledgers.
create table if not exists public.keep_free_economy_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check(amount <> 0),
  event_type text not null,
  source_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(profile_id,source_key)
);
create index if not exists idx_keep_free_economy_events_profile_time
  on public.keep_free_economy_events(profile_id,created_at desc);
create index if not exists idx_keep_free_economy_events_type_time
  on public.keep_free_economy_events(event_type,created_at desc);
alter table public.keep_free_economy_events enable row level security;
drop policy if exists keep_free_economy_events_select_own on public.keep_free_economy_events;
create policy keep_free_economy_events_select_own
  on public.keep_free_economy_events for select to authenticated
  using(profile_id=(select auth.uid()));

create or replace function public.keep_free_economy_event_adjustment_for_profile(p_uid uuid)
returns integer
language sql stable security definer set search_path=public
as $$
  select coalesce(sum(amount),0)::integer
  from public.keep_free_economy_events
  where profile_id=p_uid
$$;
revoke all on function public.keep_free_economy_event_adjustment_for_profile(uuid) from public,anon,authenticated;
grant execute on function public.keep_free_economy_event_adjustment_for_profile(uuid) to service_role;

-- Every successful listen has a durable idempotency record. Audio is never stored.
create table if not exists public.keep_listen_success_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_key text not null,
  period_key text not null,
  charged_free integer not null default 0 check(charged_free >= 0),
  created_at timestamptz not null default now(),
  unique(profile_id,source_key)
);
create index if not exists idx_keep_listen_success_profile_time
  on public.keep_listen_success_events(profile_id,created_at desc);
alter table public.keep_listen_success_events enable row level security;
drop policy if exists keep_listen_success_events_select_own on public.keep_listen_success_events;
create policy keep_listen_success_events_select_own
  on public.keep_listen_success_events for select to authenticated
  using(profile_id=(select auth.uid()));

-- Streak state; reward events themselves stay immutable in keep_free_economy_events.
create table if not exists public.keep_listen_streaks (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak integer not null default 0 check(current_streak >= 0),
  last_success_day date,
  freeze_month text,
  updated_at timestamptz not null default now()
);
alter table public.keep_listen_streaks enable row level security;
drop policy if exists keep_listen_streaks_select_own on public.keep_listen_streaks;
create policy keep_listen_streaks_select_own
  on public.keep_listen_streaks for select to authenticated
  using(profile_id=(select auth.uid()));

-- Current referral rules are prospective (+2, no milestone, 20/month).
-- Historical referrals before the product decision keep the exact legacy calculation.
create or replace function public.keep_referral_rules()
returns jsonb
language sql stable security definer set search_path=public
as $$
 select jsonb_build_object(
  'free_per_signup',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_v2_free_per_signup'),2),
  'bonus_3',0,
  'bonus_5',0,
  'bonus_10',0,
  'monthly_cap',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_v2_monthly_free_cap'),20)
 )
$$;
revoke all on function public.keep_referral_rules() from public;
grant execute on function public.keep_referral_rules() to anon,authenticated;

create or replace function public.keep_referral_free_credit_bonus_for_profile(p_uid uuid)
returns integer
language plpgsql stable security definer set search_path=public
as $$
declare
  cutoff timestamptz := '2026-10-04 18:09:24+00'::timestamptz;
  legacy_per integer:=2;
  legacy_b3 integer:=3;
  legacy_b5 integer:=5;
  legacy_b10 integer:=10;
  legacy_cap integer:=20;
  new_per integer:=2;
  new_cap integer:=20;
  legacy_total integer:=0;
  new_total integer:=0;
begin
  if p_uid is null then return 0; end if;

  legacy_per:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2);
  legacy_b3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_3'),3);
  legacy_b5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_5'),5);
  legacy_b10:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_10'),10);
  legacy_cap:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),20);
  new_per:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_v2_free_per_signup'),2);
  new_cap:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_v2_monthly_free_cap'),20);

  select coalesce(sum(least(legacy_cap,
    c*legacy_per
    + case when c>=3 then legacy_b3 else 0 end
    + case when c>=5 then legacy_b5 else 0 end
    + case when c>=10 then legacy_b10 else 0 end
  )),0)::integer
  into legacy_total
  from (
    select date_trunc('month',qualified_at) month_bucket,count(*)::integer c
    from public.keep_referrals
    where referrer_profile_id=p_uid and qualified_at<cutoff
    group by 1
  ) q;

  select coalesce(sum(least(new_cap,c*new_per)),0)::integer
  into new_total
  from (
    select date_trunc('month',qualified_at) month_bucket,count(*)::integer c
    from public.keep_referrals
    where referrer_profile_id=p_uid and qualified_at>=cutoff
    group by 1
  ) q;

  return legacy_total+new_total;
end;
$$;

create or replace function public.keep_referral_status()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  cutoff timestamptz := '2026-10-04 18:09:24+00'::timestamptz;
  month_count integer:=0;
  lifetime_count integer:=0;
  month_bonus integer:=0;
  total_bonus integer:=0;
  r jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select public.keep_referral_rules() into r;
  select count(*)::integer into month_count
  from public.keep_referrals
  where referrer_profile_id=uid
    and qualified_at>=greatest(date_trunc('month',now()),cutoff);
  select count(*)::integer into lifetime_count
  from public.keep_referrals where referrer_profile_id=uid;
  month_bonus:=least((r->>'monthly_cap')::integer,month_count*(r->>'free_per_signup')::integer);
  total_bonus:=public.keep_referral_free_credit_bonus_for_profile(uid);
  return r || jsonb_build_object(
    'month_referrals',month_count,
    'lifetime_referrals',lifetime_count,
    'month_free_earned',month_bonus,
    'total_free_earned',total_bonus,
    'code',public.keep_my_referral_code()
  );
end;
$$;
revoke all on function public.keep_referral_status() from public;
grant execute on function public.keep_referral_status() to authenticated;

-- Preserve all existing credit sources, but use 5 FREE for accounts created
-- after the 04/10 decision and aggregate the new additive economy ledger.
create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql stable security definer
set search_path to 'public','auth'
as $$
declare
  cutoff timestamptz := '2026-10-04 18:09:24+00'::timestamptz;
  guest_limit integer:=3;
  signup_bonus integer:=20;
  account_created timestamptz;
  is_anon boolean:=false;
  follower_count integer:=0;
  follower_bonus integer:=0;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  referral_bonus integer:=0;
  monthly_bonus integer:=0;
  admin_grant integer:=0;
  battle_adjustment integer:=0;
  marketplace_adjustment integer:=0;
  solo_pack_spent integer:=0;
  economy_adjustment integer:=0;
  ledger_used integer:=0;
  derived_used integer:=0;
  used integer:=0;
  capacity integer:=0;
begin
  if p_uid is null then return 0; end if;

  guest_limit:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit'),3);
  select u.created_at,coalesce(u.is_anonymous,false)
    into account_created,is_anon from auth.users u where u.id=p_uid;
  if is_anon then
    signup_bonus:=0;
  elsif account_created is not null and account_created>=cutoff then
    signup_bonus:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_free_new_accounts'),5);
  else
    signup_bonus:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes'),20);
  end if;

  select count(*)::integer into follower_count from public.follows where followee_id=p_uid;
  f3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  f250c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
  f1000c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
  follower_bonus:=(case when follower_count>=f3 then f250c else 0 end)+(case when follower_count>=f5 then f1000c else 0 end);

  referral_bonus:=public.keep_referral_free_credit_bonus_for_profile(p_uid);
  monthly_bonus:=public.keep_monthly_free_bonus_for_profile(p_uid);
  admin_grant:=public.keep_admin_credit_grant_total_for_profile(p_uid);
  battle_adjustment:=public.keep_battle_credit_adjustment_for_profile(p_uid);
  marketplace_adjustment:=public.keep_playlist_sale_free_adjustment_for_profile(p_uid);
  solo_pack_spent:=public.keep_battle_solo_pack_spent_for_profile(p_uid);
  economy_adjustment:=public.keep_free_economy_event_adjustment_for_profile(p_uid);

  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used);

  capacity:=greatest(
    used,
    guest_limit+signup_bonus+follower_bonus+referral_bonus+monthly_bonus+admin_grant
      +battle_adjustment+marketplace_adjustment+economy_adjustment-solo_pack_spent
  );
  return greatest(0,capacity-used);
end;
$$;

-- Apply streak reward on the first successful listen of a local calendar day.
create or replace function public.keep_apply_listen_streak(p_uid uuid,p_day date,p_plan_code text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  s public.keep_listen_streaks%rowtype;
  next_streak integer:=1;
  freeze_used boolean:=false;
  month_key text:=to_char(p_day,'YYYY-MM');
  daily_reward integer:=1;
  week_reward integer:=5;
  reward integer:=0;
begin
  if p_uid is null or p_day is null then return '{}'::jsonb; end if;

  select * into s from public.keep_listen_streaks where profile_id=p_uid for update;
  if found and s.last_success_day=p_day then
    return jsonb_build_object('streak',s.current_streak,'reward',0,'freezeUsed',false);
  end if;

  if found and s.last_success_day=p_day-1 then
    next_streak:=greatest(1,s.current_streak+1);
  elsif found and s.last_success_day=p_day-2
    and coalesce(p_plan_code,'FREE')<>'FREE'
    and coalesce(s.freeze_month,'')<>month_key then
    next_streak:=greatest(1,s.current_streak+1);
    freeze_used:=true;
  else
    next_streak:=1;
  end if;

  daily_reward:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_streak_daily_free'),1));
  week_reward:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_streak_day7_bonus_free'),5));

  if daily_reward>0 then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(p_uid,daily_reward,'LISTEN_STREAK_DAILY','STREAK_DAILY:'||p_day::text,jsonb_build_object('day',p_day,'streak',next_streak))
    on conflict(profile_id,source_key) do nothing;
    reward:=reward+daily_reward;
  end if;

  if next_streak%7=0 and week_reward>0 then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(p_uid,week_reward,'LISTEN_STREAK_WEEK','STREAK_WEEK:'||p_day::text,jsonb_build_object('day',p_day,'streak',next_streak))
    on conflict(profile_id,source_key) do nothing;
    reward:=reward+week_reward;
  end if;

  insert into public.keep_listen_streaks(profile_id,current_streak,last_success_day,freeze_month,updated_at)
  values(p_uid,next_streak,p_day,case when freeze_used then month_key else null end,now())
  on conflict(profile_id) do update set
    current_streak=excluded.current_streak,
    last_success_day=excluded.last_success_day,
    freeze_month=case when freeze_used then month_key else public.keep_listen_streaks.freeze_month end,
    updated_at=now();

  return jsonb_build_object('streak',next_streak,'reward',reward,'freezeUsed',freeze_used);
end;
$$;
revoke all on function public.keep_apply_listen_streak(uuid,date,text) from public,anon,authenticated;
grant execute on function public.keep_apply_listen_streak(uuid,date,text) to service_role;

create or replace function public.keep_listen_status(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql stable security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  anon boolean:=false;
  plan_code text:='FREE';
  period_key text;
  used integer:=0;
  lim integer:=0;
  free_balance integer:=0;
  over_cost integer:=1;
  over_quota boolean:=false;
  can_listen boolean:=true;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  anon:=coalesce((select is_anonymous from auth.users where id=uid),false);
  plan_code:=public.keep_active_plan_code(uid);

  if anon then
    period_key:='LIFETIME';
    lim:=greatest(1,coalesce(
      (select (value #>> '{}')::integer from public.remote_config where key='guest_listen_total_limit'),
      (select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit'),
      3
    ));
  else
    period_key:=(now() at time zone v_tz)::date::text;
    lim:=greatest(1,coalesce(public.keep_plan_limit(plan_code,'listens_per_day'),5));
  end if;

  select coalesce(used_count,0) into used
  from public.feature_usage_counters
  where profile_id=uid and feature_key='LISTEN_DAILY' and period_key=period_key;
  used:=coalesce(used,0);
  over_cost:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost'),1));
  free_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  over_quota:=used>=lim;
  can_listen:=case when anon then not over_quota else (not over_quota or free_balance>=over_cost) end;

  return jsonb_build_object(
    'planCode',plan_code,
    'isAnonymous',anon,
    'featureKey','LISTEN_DAILY',
    'periodKey',period_key,
    'used',used,
    'limit',lim,
    'includedRemaining',greatest(0,lim-used),
    'overQuota',over_quota,
    'overQuotaFreeCost',over_cost,
    'freeBalance',free_balance,
    'canListen',can_listen,
    'timezone',v_tz
  );
end;
$$;
revoke all on function public.keep_listen_status(text) from public,anon;
grant execute on function public.keep_listen_status(text) to authenticated;

create or replace function public.keep_record_listen_success(
  p_source_key text,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_source text:=left(trim(coalesce(p_source_key,'')),160);
  anon boolean:=false;
  plan_code text:='FREE';
  period_key text;
  local_day date;
  used integer:=0;
  lim integer:=0;
  cost integer:=1;
  free_balance integer:=0;
  credit_used integer:=0;
  st record;
  streak jsonb:='{}'::jsonb;
  result jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if v_source='' then raise exception 'listen_source_key_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  if exists(select 1 from public.keep_listen_success_events where profile_id=uid and source_key=v_source) then
    result:=public.keep_listen_status(v_tz);
    return result || jsonb_build_object('ok',true,'deduplicated',true,'chargedFree',0);
  end if;

  anon:=coalesce((select is_anonymous from auth.users where id=uid),false);
  plan_code:=public.keep_active_plan_code(uid);
  local_day:=(now() at time zone v_tz)::date;

  if anon then
    period_key:='LIFETIME';
    lim:=greatest(1,coalesce(
      (select (value #>> '{}')::integer from public.remote_config where key='guest_listen_total_limit'),
      (select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit'),
      3
    ));
  else
    period_key:=local_day::text;
    lim:=greatest(1,coalesce(public.keep_plan_limit(plan_code,'listens_per_day'),5));
  end if;

  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(uid,'LISTEN_DAILY',period_key,0,now())
  on conflict(profile_id,feature_key,period_key) do nothing;

  select used_count into used
  from public.feature_usage_counters
  where profile_id=uid and feature_key='LISTEN_DAILY' and period_key=period_key
  for update;
  used:=coalesce(used,0);

  if anon and used>=lim then
    return public.keep_listen_status(v_tz)
      || jsonb_build_object('ok',false,'deduplicated',false,'chargedFree',0,'reason','GUEST_LIMIT_REACHED');
  end if;

  cost:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost'),1));

  if not anon and used>=lim then
    free_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
    if free_balance<cost then
      return public.keep_listen_status(v_tz)
        || jsonb_build_object('ok',false,'deduplicated',false,'chargedFree',0,'reason','FREE_REQUIRED');
    end if;

    insert into public.download_credit_usage(profile_id,consumed_count,updated_at)
    values(uid,0,now()) on conflict(profile_id) do nothing;

    select consumed_count into credit_used
    from public.download_credit_usage where profile_id=uid for update;
    select * into st from public.keep_download_credit_status();
    credit_used:=greatest(coalesce(credit_used,0),coalesce(st.consumed,0));
    if coalesce(st.remaining,0)<cost then
      return public.keep_listen_status(v_tz)
        || jsonb_build_object('ok',false,'deduplicated',false,'chargedFree',0,'reason','FREE_REQUIRED');
    end if;

    update public.download_credit_usage
    set consumed_count=credit_used+cost,updated_at=now()
    where profile_id=uid;

    insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
    values(uid,cost,'LISTEN_OVER_QUOTA','LISTEN:'||v_source,now())
    on conflict(profile_id,source_key) where source_key is not null do nothing;
  else
    cost:=0;
  end if;

  update public.feature_usage_counters
  set used_count=used+1,updated_at=now()
  where profile_id=uid and feature_key='LISTEN_DAILY' and period_key=period_key;

  insert into public.keep_listen_success_events(profile_id,source_key,period_key,charged_free,created_at)
  values(uid,v_source,period_key,cost,now());

  if not anon then
    streak:=public.keep_apply_listen_streak(uid,local_day,plan_code);
  end if;

  result:=public.keep_listen_status(v_tz);
  return result || jsonb_build_object(
    'ok',true,
    'deduplicated',false,
    'chargedFree',cost,
    'streak',streak
  );
end;
$$;
revoke all on function public.keep_record_listen_success(text,text) from public,anon;
grant execute on function public.keep_record_listen_success(text,text) to authenticated;

-- Reward the immutable first discoverer when another profile later KEEPs the same track.
create table if not exists public.keep_first_discovery_credit_events (
  id uuid primary key default gen_random_uuid(),
  first_discoverer_id uuid not null references public.profiles(id) on delete cascade,
  keeper_profile_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  keep_decision_id uuid not null references public.keep_decisions(id) on delete cascade,
  amount integer not null default 1 check(amount > 0),
  created_at timestamptz not null default now(),
  unique(keep_decision_id)
);
create index if not exists idx_first_discovery_credit_profile_time
  on public.keep_first_discovery_credit_events(first_discoverer_id,created_at desc);
alter table public.keep_first_discovery_credit_events enable row level security;
drop policy if exists keep_first_discovery_credit_events_select_own on public.keep_first_discovery_credit_events;
create policy keep_first_discovery_credit_events_select_own
  on public.keep_first_discovery_credit_events for select to authenticated
  using(first_discoverer_id=(select auth.uid()));

create or replace function public.keep_reward_first_discoverer_on_keep()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  discoverer uuid;
  cap integer:=20;
  reward integer:=1;
  month_count integer:=0;
begin
  if new.decision<>'KEPT' then return new; end if;

  select profile_id into discoverer
  from public.keep_track_first_discoveries
  where track_id=new.track_id;

  if discoverer is null or discoverer=new.profile_id then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(discoverer::text,0));
  cap:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_monthly_free_cap'),20));
  reward:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_free_per_keep'),1));
  if cap=0 or reward=0 then return new; end if;

  select count(*)::integer into month_count
  from public.keep_first_discovery_credit_events
  where first_discoverer_id=discoverer
    and created_at>=date_trunc('month',now());

  if month_count>=cap then return new; end if;

  insert into public.keep_first_discovery_credit_events(
    first_discoverer_id,keeper_profile_id,track_id,keep_decision_id,amount
  ) values(discoverer,new.profile_id,new.track_id,new.id,reward)
  on conflict(keep_decision_id) do nothing;

  if found then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(
      discoverer,reward,'FIRST_DISCOVERY_KEEP','FIRST_DISCOVERY:'||new.id::text,
      jsonb_build_object('trackId',new.track_id,'keeperProfileId',new.profile_id,'keepDecisionId',new.id)
    )
    on conflict(profile_id,source_key) do nothing;
  end if;

  return new;
end;
$$;
revoke all on function public.keep_reward_first_discoverer_on_keep() from public,anon,authenticated;

drop trigger if exists zz_keep_reward_first_discoverer_trg on public.keep_decisions;
create trigger zz_keep_reward_first_discoverer_trg
after insert on public.keep_decisions
for each row execute function public.keep_reward_first_discoverer_on_keep();

-- Extend the existing unified dashboard with new economy earnings while preserving old keys.
create or replace function public.keep_free_wallet_status(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql stable security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid();
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_balance integer:=0;
  v_battle_earned integer:=0;
  v_solo_earned integer:=0;
  v_bonus_earned integer:=0;
  v_admin_earned integer:=0;
  v_marketplace_earned integer:=0;
  v_economy_earned integer:=0;
  v_streak_earned integer:=0;
  v_discovery_earned integer:=0;
  v_recharge_earned integer:=0;
  v_lost integer:=0;
  v_keep_spent integer:=0;
  v_keep_count integer:=0;
  v_listen_spent integer:=0;
  v_listen_paid_count integer:=0;
  v_marketplace_spent integer:=0;
  v_marketplace_purchase_count integer:=0;
  v_earned integer:=0;
  v_spent integer:=0;
  v_streak integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start:=date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start:=v_local_start at time zone v_tz;
  v_end:=(v_local_start+interval '1 day') at time zone v_tz;
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);

  select coalesce(sum(greatest(e.amount,0)),0)::integer,
         coalesce(sum(abs(least(e.amount,0))),0)::integer
    into v_battle_earned,v_lost
  from (
    select amount,created_at from public.keep_battle_credit_events where profile_id=uid
    union all
    select amount,created_at from public.keep_battle_arena_credit_events where profile_id=uid
  ) e where e.created_at>=v_start and e.created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_solo_earned
  from public.keep_battle_solo_credit_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select v_lost+coalesce(sum(abs(least(amount,0))),0)::integer
    into v_lost
  from public.keep_battle_solo_credit_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_bonus_earned
  from public.keep_battle_perfect_bonus_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount,0)),0)::integer
    into v_admin_earned
  from public.admin_credit_grants
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount_free,0)),0)::integer
    into v_marketplace_earned
  from public.playlist_sale_payments
  where seller_id=uid and provider='FREE_CREDITS' and status='COMPLETED'
    and coalesce(delivered_at,created_at)>=v_start and coalesce(delivered_at,created_at)<v_end;

  select
    coalesce(sum(greatest(amount,0)),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type like 'LISTEN_STREAK%'),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type='FIRST_DISCOVERY_KEEP'),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type='IAP_RECHARGE'),0)::integer
  into v_economy_earned,v_streak_earned,v_discovery_earned,v_recharge_earned
  from public.keep_free_economy_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select
    coalesce(sum(greatest(amount,0)) filter(where reason='KEEP_PROFILE'),0)::integer,
    count(*) filter(where reason='KEEP_PROFILE')::integer,
    coalesce(sum(greatest(amount,0)) filter(where reason='LISTEN_OVER_QUOTA'),0)::integer,
    count(*) filter(where reason='LISTEN_OVER_QUOTA')::integer
  into v_keep_spent,v_keep_count,v_listen_spent,v_listen_paid_count
  from public.keep_free_spend_events
  where profile_id=uid and created_at>=v_start and created_at<v_end;

  select coalesce(sum(greatest(amount_free,0)),0)::integer,count(*)::integer
    into v_marketplace_spent,v_marketplace_purchase_count
  from public.playlist_sale_payments
  where buyer_id=uid and provider='FREE_CREDITS' and status='COMPLETED'
    and coalesce(delivered_at,created_at)>=v_start and coalesce(delivered_at,created_at)<v_end;

  select coalesce(current_streak,0) into v_streak
  from public.keep_listen_streaks where profile_id=uid;
  v_streak:=coalesce(v_streak,0);

  v_earned:=v_battle_earned+v_solo_earned+v_bonus_earned+v_admin_earned+v_marketplace_earned+v_economy_earned;
  v_spent:=v_keep_spent+v_listen_spent+v_marketplace_spent;

  return jsonb_build_object(
    'balance',v_balance,
    'earnedToday',v_earned,
    'lostToday',v_lost,
    'spentToday',v_spent,
    'netToday',v_earned-v_lost-v_spent,
    'battleEarnedToday',v_battle_earned,
    'soloEarnedToday',v_solo_earned,
    'bonusEarnedToday',v_bonus_earned,
    'adminEarnedToday',v_admin_earned,
    'marketplaceEarnedToday',v_marketplace_earned,
    'economyEarnedToday',v_economy_earned,
    'streakEarnedToday',v_streak_earned,
    'discoveryEarnedToday',v_discovery_earned,
    'rechargeEarnedToday',v_recharge_earned,
    'keepSpentToday',v_keep_spent,
    'keepCountToday',v_keep_count,
    'listenSpentToday',v_listen_spent,
    'listenPaidCountToday',v_listen_paid_count,
    'marketplaceSpentToday',v_marketplace_spent,
    'marketplacePurchaseCountToday',v_marketplace_purchase_count,
    'listenStreak',v_streak,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end
  );
end;
$$;
revoke all on function public.keep_free_wallet_status(text) from public,anon;
grant execute on function public.keep_free_wallet_status(text) to authenticated;
