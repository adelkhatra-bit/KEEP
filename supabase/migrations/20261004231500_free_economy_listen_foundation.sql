-- Économie FREE — fondation serveur canonique du 04/10/2026.
-- Additif et grandfather-safe : aucun compte existant ne perd son bonus d'inscription historique.
begin;

insert into public.remote_config(key,value,description,updated_at)
values
  ('guest_recognition_limit','3'::jsonb,'Nombre total de reconnaissances invité avant création/connexion de compte.',now()),
  ('signup_bonus_recognitions','5'::jsonb,'Bonus FREE accordé aux nouveaux comptes créés après la décision Économie FREE du 04/10/2026.',now()),
  ('demo_listen_limit','3'::jsonb,'Nombre total de morceaux identifiés en mode démo avant création/connexion de compte.',now())
on conflict(key) do update
set value=excluded.value, description=excluded.description, updated_at=now();

insert into public.usage_limits(plan_id,limit_key,limit_value)
select p.id,'listens_per_day',
  case p.code::text
    when 'FREE' then 5
    when 'PREMIUM' then 30
    when 'CREATOR_PRO' then 60
    when 'VENUE_PRO' then 150
  end
from public.plans p
where p.code::text in ('FREE','PREMIUM','CREATOR_PRO','VENUE_PRO')
on conflict(plan_id,limit_key) do update set limit_value=excluded.limit_value;

create table if not exists public.listen_success_events(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_key text not null,
  period_key text not null,
  plan_code text not null,
  charged_free integer not null default 0 check(charged_free in (0,1)),
  created_at timestamptz not null default now(),
  unique(profile_id,source_key)
);
create index if not exists idx_listen_success_events_profile_period
  on public.listen_success_events(profile_id,period_key,created_at desc);
alter table public.listen_success_events enable row level security;
revoke all on table public.listen_success_events from public,anon,authenticated;
grant select,insert on table public.listen_success_events to service_role;

create table if not exists public.guest_listen_success_events(
  identity_hash text not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  primary key(identity_hash,source_key)
);
create index if not exists idx_guest_listen_success_identity_time
  on public.guest_listen_success_events(identity_hash,created_at desc);
alter table public.guest_listen_success_events enable row level security;
revoke all on table public.guest_listen_success_events from public,anon,authenticated;
grant select,insert on table public.guest_listen_success_events to service_role;

create or replace function public.keep_signup_bonus_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  v_created_at timestamptz;
  v_is_anonymous boolean:=false;
  v_legacy integer:=20;
  v_current integer:=5;
  v_cutoff constant timestamptz:='2026-10-04 20:09:00+02'::timestamptz;
begin
  if p_uid is null then return 0; end if;
  select u.created_at,coalesce(u.is_anonymous,false)
    into v_created_at,v_is_anonymous
  from auth.users u where u.id=p_uid;
  if v_created_at is null or v_is_anonymous then return 0; end if;
  v_legacy:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1),20);
  v_current:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_recognitions' limit 1),5);
  return greatest(0,case when v_created_at < v_cutoff then v_legacy else v_current end);
end;
$function$;
revoke all on function public.keep_signup_bonus_for_profile(uuid) from public,anon,authenticated;
grant execute on function public.keep_signup_bonus_for_profile(uuid) to service_role;

create or replace function public.keep_listen_free_spent_for_profile(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $function$
  select coalesce(sum(e.amount),0)::integer
  from public.keep_free_spend_events e
  where e.profile_id=p_uid and e.reason='LISTEN_OVER_QUOTA';
$function$;
revoke all on function public.keep_listen_free_spent_for_profile(uuid) from public,anon,authenticated;
grant execute on function public.keep_listen_free_spent_for_profile(uuid) to service_role;

create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $function$
declare
  guest_limit integer:=3;
  signup_bonus integer:=0;
  follower_count integer:=0;
  follower_bonus integer:=0;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  referral_bonus integer:=0; monthly_bonus integer:=0;
  admin_grant integer:=0; battle_adjustment integer:=0; marketplace_adjustment integer:=0;
  solo_pack_spent integer:=0; listen_spent integer:=0;
  ledger_used integer:=0; derived_used integer:=0; used integer:=0; capacity integer:=0;
begin
  if p_uid is null then return 0; end if;
  guest_limit:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus:=public.keep_signup_bonus_for_profile(p_uid);
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
  listen_spent:=public.keep_listen_free_spent_for_profile(p_uid);
  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used)+listen_spent;
  capacity:=greatest(used,guest_limit+signup_bonus+follower_bonus+referral_bonus+monthly_bonus+admin_grant+battle_adjustment+marketplace_adjustment-solo_pack_spent);
  return greatest(0,capacity-used);
end;
$function$;

create or replace function public.keep_download_credit_status()
returns table(plan_code text,is_anonymous boolean,consumed integer,credit_limit integer,remaining integer,unlimited boolean,cost_per_keep integer)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid:=auth.uid();
  guest_limit integer:=3;
  signup_bonus integer:=0;
  ledger_used integer:=0;
  derived_used integer:=0;
  used integer:=0;
  anon boolean:=false;
  active_plan text:='FREE';
  reward record;
  reward_credits integer:=0;
  battle_adjustment integer:=0;
  monthly_bonus integer:=0;
  raw_limit integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  guest_limit:=coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='guest_success_limit' limit 1),3);
  signup_bonus:=public.keep_signup_bonus_for_profile(uid);
  anon:=coalesce((select u.is_anonymous from auth.users u where u.id=uid),false);
  active_plan:=public.keep_active_plan_code(uid);
  plan_code:=active_plan; is_anonymous:=anon;

  ledger_used:=coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid),0);
  if anon then
    used:=ledger_used; reward_credits:=0; battle_adjustment:=0; monthly_bonus:=0;
  else
    derived_used:=public.keep_chargeable_keep_count(uid);
    used:=greatest(ledger_used,derived_used);
    if used>ledger_used then
      insert into public.download_credit_usage(profile_id,consumed_count,updated_at) values(uid,used,now())
      on conflict(profile_id) do update set consumed_count=greatest(public.download_credit_usage.consumed_count,excluded.consumed_count),updated_at=now();
    end if;
    select * into reward from public.keep_growth_reward_status();
    reward_credits:=coalesce(reward.bonus_free_credits,0);
    battle_adjustment:=public.keep_battle_credit_adjustment_for_profile(uid);
    monthly_bonus:=public.keep_monthly_free_bonus_for_profile(uid);
  end if;

  raw_limit:=case when anon then guest_limit else guest_limit+signup_bonus+reward_credits+battle_adjustment+monthly_bonus end;
  consumed:=used;
  unlimited:=false;
  remaining:=case when anon then greatest(0,raw_limit-used) else public.keep_theoretical_free_credit_remaining_for_profile(uid) end;
  credit_limit:=used+remaining;
  cost_per_keep:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1),1));
  return next;
end;
$function$;

create or replace function public.keep_listen_daily_status(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid:=auth.uid();
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_period text;
  v_plan text:='FREE';
  v_limit integer:=5;
  v_used integer:=0;
  v_balance integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_period:=to_char(now() at time zone v_tz,'YYYY-MM-DD');
  v_plan:=public.keep_active_plan_code(uid);
  v_limit:=coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),
    case v_plan when 'PREMIUM' then 30 when 'CREATOR_PRO' then 60 when 'VENUE_PRO' then 150 else 5 end);
  select coalesce(c.used_count,0) into v_used
  from public.feature_usage_counters c
  where c.profile_id=uid and c.feature_key='LISTEN_DAILY' and c.period_key=v_period;
  v_used:=coalesce(v_used,0);
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  return jsonb_build_object(
    'planCode',v_plan,'periodKey',v_period,'timezone',v_tz,
    'used',v_used,'limit',v_limit,'remainingIncluded',greatest(v_limit-v_used,0),
    'overQuota',v_used>=v_limit,'freeCostAfterQuota',1,'freeBalance',v_balance
  );
end;
$function$;
revoke all on function public.keep_listen_daily_status(text) from public,anon;
grant execute on function public.keep_listen_daily_status(text) to authenticated;

create or replace function public.service_listen_precheck(
  p_profile_id uuid,
  p_timezone text default 'Europe/Paris',
  p_allow_free boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_period text; v_plan text; v_limit integer; v_used integer:=0; v_balance integer:=0; v_over boolean:=false;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('allowed',false,'reason','PROFILE_REQUIRED');
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_period:=to_char(now() at time zone v_tz,'YYYY-MM-DD');
  v_plan:=public.keep_active_plan_code(p_profile_id);
  v_limit:=coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),
    case v_plan when 'PREMIUM' then 30 when 'CREATOR_PRO' then 60 when 'VENUE_PRO' then 150 else 5 end);
  select coalesce(used_count,0) into v_used from public.feature_usage_counters
    where profile_id=p_profile_id and feature_key='LISTEN_DAILY' and period_key=v_period;
  v_used:=coalesce(v_used,0);
  v_over:=v_used>=v_limit;
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  return jsonb_build_object(
    'allowed',(not v_over) or (p_allow_free and v_balance>=1),
    'requiresFree',v_over,
    'reason',case when not v_over then null when not p_allow_free then 'LISTEN_FREE_REQUIRED' when v_balance<1 then 'INSUFFICIENT_FREE' else null end,
    'planCode',v_plan,'periodKey',v_period,'used',v_used,'limit',v_limit,
    'remainingIncluded',greatest(v_limit-v_used,0),'freeCost',case when v_over then 1 else 0 end,'freeBalance',v_balance
  );
end;
$function$;
revoke all on function public.service_listen_precheck(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.service_listen_precheck(uuid,text,boolean) to service_role;

create or replace function public.service_record_listen_success(
  p_profile_id uuid,
  p_source_key text,
  p_timezone text default 'Europe/Paris',
  p_allow_free boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_period text; v_plan text; v_limit integer; v_used integer:=0; v_balance integer:=0;
  v_charge integer:=0; v_id uuid; v_existing record;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('recorded',false,'reason','PROFILE_REQUIRED');
  end if;
  if nullif(trim(coalesce(p_source_key,'')),'') is null then
    return jsonb_build_object('recorded',false,'reason','SOURCE_KEY_REQUIRED');
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text,0));
  select * into v_existing from public.listen_success_events
    where profile_id=p_profile_id and source_key=p_source_key;
  if found then
    return jsonb_build_object('recorded',true,'duplicate',true,'chargedFree',v_existing.charged_free);
  end if;

  v_period:=to_char(now() at time zone v_tz,'YYYY-MM-DD');
  v_plan:=public.keep_active_plan_code(p_profile_id);
  v_limit:=coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),
    case v_plan when 'PREMIUM' then 30 when 'CREATOR_PRO' then 60 when 'VENUE_PRO' then 150 else 5 end);
  select coalesce(used_count,0) into v_used from public.feature_usage_counters
    where profile_id=p_profile_id and feature_key='LISTEN_DAILY' and period_key=v_period;
  v_used:=coalesce(v_used,0);
  if v_used>=v_limit then
    if not p_allow_free then return jsonb_build_object('recorded',false,'reason','LISTEN_FREE_REQUIRED','used',v_used,'limit',v_limit); end if;
    v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
    if v_balance<1 then return jsonb_build_object('recorded',false,'reason','INSUFFICIENT_FREE','used',v_used,'limit',v_limit,'freeBalance',v_balance); end if;
    v_charge:=1;
  end if;

  insert into public.listen_success_events(profile_id,source_key,period_key,plan_code,charged_free)
  values(p_profile_id,p_source_key,v_period,v_plan,v_charge)
  returning id into v_id;

  if v_charge=1 then
    insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
    values(p_profile_id,1,'LISTEN_OVER_QUOTA','LISTEN:'||p_source_key,now())
    on conflict do nothing;
  end if;

  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(p_profile_id,'LISTEN_DAILY',v_period,1,now())
  on conflict(profile_id,feature_key,period_key) do update
    set used_count=public.feature_usage_counters.used_count+1,updated_at=now();

  perform public.service_record_recognition_success(p_profile_id);
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  return jsonb_build_object(
    'recorded',true,'duplicate',false,'chargedFree',v_charge,
    'used',v_used+1,'limit',v_limit,'remainingIncluded',greatest(v_limit-(v_used+1),0),
    'freeBalance',v_balance,'periodKey',v_period,'planCode',v_plan
  );
end;
$function$;
revoke all on function public.service_record_listen_success(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.service_record_listen_success(uuid,text,text,boolean) to service_role;

create or replace function public.service_guest_listen_precheck(p_identity_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare v_limit integer:=3; v_used integer:=0;
begin
  if p_identity_hash is null or length(btrim(p_identity_hash))<16 then return jsonb_build_object('allowed',false,'reason','IDENTITY_REQUIRED'); end if;
  v_limit:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),3));
  select count(*)::integer into v_used from public.guest_listen_success_events where identity_hash=p_identity_hash;
  return jsonb_build_object('allowed',v_used<v_limit,'used',v_used,'limit',v_limit,'remaining',greatest(v_limit-v_used,0),'reason',case when v_used>=v_limit then 'GUEST_LISTEN_LIMIT_REACHED' else null end);
end;
$function$;
revoke all on function public.service_guest_listen_precheck(text) from public,anon,authenticated;
grant execute on function public.service_guest_listen_precheck(text) to service_role;

create or replace function public.service_record_guest_listen_success(p_identity_hash text,p_source_key text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare v_limit integer:=3; v_used integer:=0;
begin
  if p_identity_hash is null or length(btrim(p_identity_hash))<16 then return jsonb_build_object('recorded',false,'reason','IDENTITY_REQUIRED'); end if;
  if nullif(trim(coalesce(p_source_key,'')),'') is null then return jsonb_build_object('recorded',false,'reason','SOURCE_KEY_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_identity_hash,0));
  v_limit:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),3));
  select count(*)::integer into v_used from public.guest_listen_success_events where identity_hash=p_identity_hash;
  if exists(select 1 from public.guest_listen_success_events where identity_hash=p_identity_hash and source_key=p_source_key) then
    return jsonb_build_object('recorded',true,'duplicate',true,'used',v_used,'limit',v_limit);
  end if;
  if v_used>=v_limit then return jsonb_build_object('recorded',false,'reason','GUEST_LISTEN_LIMIT_REACHED','used',v_used,'limit',v_limit); end if;
  insert into public.guest_listen_success_events(identity_hash,source_key) values(p_identity_hash,p_source_key);
  return jsonb_build_object('recorded',true,'duplicate',false,'used',v_used+1,'limit',v_limit,'remaining',greatest(v_limit-v_used-1,0));
end;
$function$;
revoke all on function public.service_record_guest_listen_success(text,text) from public,anon,authenticated;
grant execute on function public.service_record_guest_listen_success(text,text) to service_role;

create or replace function public.keep_free_credit_breakdown()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid(); guest_limit integer; signup_bonus integer; follower_count integer;
  f3 integer; f5 integer; f250c integer; f1000c integer; follower_bonus integer;
  referral_bonus integer; referral_count integer; monthly_bonus integer; admin_grant integer;
  battle_adjustment integer; battle_won integer; battle_lost integer; used integer; locked_arena integer;
  listen_spent integer; remaining integer; recent_battles jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  guest_limit:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1),3);
  signup_bonus:=public.keep_signup_bonus_for_profile(uid);
  select count(*)::integer into follower_count from public.follows where followee_id=uid;
  f3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier3_threshold'),250);
  f5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_tier5_threshold'),1000);
  f250c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_250_credits'),5);
  f1000c:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_followers_reward_1000_credits'),20);
  follower_bonus:=(case when follower_count>=f3 then f250c else 0 end)+(case when follower_count>=f5 then f1000c else 0 end);
  referral_bonus:=public.keep_referral_free_credit_bonus_for_profile(uid);
  select count(*)::integer into referral_count from public.keep_referrals where referrer_profile_id=uid;
  monthly_bonus:=public.keep_monthly_free_bonus_for_profile(uid);
  admin_grant:=public.keep_admin_credit_grant_total_for_profile(uid);
  select coalesce(sum(amount) filter(where amount>0),0)::integer,
         coalesce(abs(sum(amount) filter(where amount<0)),0)::integer,
         coalesce(sum(amount),0)::integer
    into battle_won,battle_lost,battle_adjustment
  from (
    select amount from public.keep_battle_credit_events where profile_id=uid
    union all select amount from public.keep_battle_arena_credit_events where profile_id=uid
    union all select amount from public.keep_battle_solo_credit_events where profile_id=uid
    union all select amount from public.keep_battle_perfect_bonus_events where profile_id=uid
  ) e;
  used:=greatest(coalesce((select consumed_count from public.download_credit_usage where profile_id=uid),0),public.keep_chargeable_keep_count(uid));
  listen_spent:=public.keep_listen_free_spent_for_profile(uid);
  locked_arena:=coalesce((select sum(amount) from public.keep_battle_arena_credit_holds where profile_id=uid and status='LOCKED'),0);
  remaining:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  select coalesce(jsonb_agg(jsonb_build_object('result',x.result,'amount',x.amount,'createdAt',x.created_at,'themeCode',x.theme_code,'battleType',x.battle_type) order by x.created_at desc),'[]'::jsonb)
    into recent_battles
  from (
    select * from (
      (select e.result,e.amount,e.created_at,a.theme_code,'ARENA'::text battle_type from public.keep_battle_arena_credit_events e join public.keep_battle_arenas a on a.id=e.arena_id where e.profile_id=uid order by e.created_at desc limit 15)
      union all
      (select 'WIN'::text,e.amount,e.created_at,a.theme_code,'ARENA_BONUS'::text from public.keep_battle_perfect_bonus_events e join public.keep_battle_arenas a on a.id=e.arena_id where e.profile_id=uid order by e.created_at desc limit 15)
      union all
      (select e.result,e.amount,e.created_at,null::text,'DUEL'::text from public.keep_battle_credit_events e where e.profile_id=uid order by e.created_at desc limit 15)
      union all
      (select e.result,e.amount,e.created_at,h.theme_code,'SOLO'::text from public.keep_battle_solo_credit_events e join public.keep_battle_solo_history h on h.id=e.history_id where e.profile_id=uid order by e.created_at desc limit 15)
    ) all_battles order by created_at desc limit 15
  ) x;
  return jsonb_build_object(
    'remaining',remaining,'guestLimit',guest_limit,'signupBonus',signup_bonus,
    'followerCount',follower_count,'followerBonus',follower_bonus,'followerTier3',f3,'followerTier5',f5,
    'referralBonus',referral_bonus,'referralCount',referral_count,'monthlyBonus',monthly_bonus,
    'adminGrant',admin_grant,'battleAdjustment',battle_adjustment,'battleWon',battle_won,'battleLost',battle_lost,
    'used',used,'listenSpent',listen_spent,'lockedArena',locked_arena,'recentBattles',recent_battles
  );
end;
$function$;

create or replace function public.keep_free_wallet_status(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid:=auth.uid(); v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone; v_start timestamptz; v_end timestamptz;
  v_balance integer:=0; v_battle_earned integer:=0; v_solo_earned integer:=0; v_bonus_earned integer:=0;
  v_admin_earned integer:=0; v_marketplace_earned integer:=0; v_lost integer:=0;
  v_keep_spent integer:=0; v_keep_count integer:=0; v_listen_spent integer:=0; v_listen_count integer:=0;
  v_marketplace_spent integer:=0; v_marketplace_purchase_count integer:=0; v_earned integer:=0; v_spent integer:=0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_local_start:=date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start:=v_local_start at time zone v_tz; v_end:=(v_local_start+interval '1 day') at time zone v_tz;
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  select coalesce(sum(greatest(e.amount,0)),0)::integer,coalesce(sum(abs(least(e.amount,0))),0)::integer into v_battle_earned,v_lost
    from (select amount,created_at from public.keep_battle_credit_events where profile_id=uid union all select amount,created_at from public.keep_battle_arena_credit_events where profile_id=uid) e
    where e.created_at>=v_start and e.created_at<v_end;
  select coalesce(sum(greatest(amount,0)),0)::integer into v_solo_earned from public.keep_battle_solo_credit_events where profile_id=uid and created_at>=v_start and created_at<v_end;
  select v_lost+coalesce(sum(abs(least(amount,0))),0)::integer into v_lost from public.keep_battle_solo_credit_events where profile_id=uid and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount,0)),0)::integer into v_bonus_earned from public.keep_battle_perfect_bonus_events where profile_id=uid and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount,0)),0)::integer into v_admin_earned from public.admin_credit_grants where profile_id=uid and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount_free,0)),0)::integer into v_marketplace_earned from public.playlist_sale_payments where seller_id=uid and provider='FREE_CREDITS' and status='COMPLETED' and coalesce(delivered_at,created_at)>=v_start and coalesce(delivered_at,created_at)<v_end;
  select coalesce(sum(greatest(amount,0)),0)::integer,count(*)::integer into v_keep_spent,v_keep_count from public.keep_free_spend_events where profile_id=uid and reason='KEEP_PROFILE' and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount,0)),0)::integer,count(*)::integer into v_listen_spent,v_listen_count from public.keep_free_spend_events where profile_id=uid and reason='LISTEN_OVER_QUOTA' and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount_free,0)),0)::integer,count(*)::integer into v_marketplace_spent,v_marketplace_purchase_count from public.playlist_sale_payments where buyer_id=uid and provider='FREE_CREDITS' and status='COMPLETED' and coalesce(delivered_at,created_at)>=v_start and coalesce(delivered_at,created_at)<v_end;
  v_earned:=v_battle_earned+v_solo_earned+v_bonus_earned+v_admin_earned+v_marketplace_earned;
  v_spent:=v_keep_spent+v_listen_spent+v_marketplace_spent;
  return jsonb_build_object(
    'balance',v_balance,'earnedToday',v_earned,'lostToday',v_lost,'spentToday',v_spent,'netToday',v_earned-v_lost-v_spent,
    'battleEarnedToday',v_battle_earned,'soloEarnedToday',v_solo_earned,'bonusEarnedToday',v_bonus_earned,'adminEarnedToday',v_admin_earned,
    'marketplaceEarnedToday',v_marketplace_earned,'keepSpentToday',v_keep_spent,'keepCountToday',v_keep_count,
    'listenSpentToday',v_listen_spent,'listenCountToday',v_listen_count,
    'marketplaceSpentToday',v_marketplace_spent,'marketplacePurchaseCountToday',v_marketplace_purchase_count,
    'period','TODAY_2AM','timezone',v_tz,'startedAt',v_start,'endsAt',v_end
  );
end;
$function$;
revoke all on function public.keep_free_wallet_status(text) from public,anon;
grant execute on function public.keep_free_wallet_status(text) to authenticated;

commit;
