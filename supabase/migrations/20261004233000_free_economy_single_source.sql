-- ECONOMIE FREE 04/10/2026 — réconciliation vers une source unique.
-- Cette migration absorbe la fondation appliquée concurremment à 21:11 et la
-- fondation listen appliquée à 21:16, sans retirer aucun crédit historique.

-- Clés canoniques du cahier des charges.
insert into public.remote_config(key,value,description,updated_at)
values
  ('guest_recognition_limit','3'::jsonb,'Reconnaissances invité totales avant création/connexion.',now()),
  ('signup_bonus_recognitions','5'::jsonb,'Bonus FREE des nouveaux comptes postérieurs au 04/10/2026 20:09 Europe/Paris.',now()),
  ('listen_over_quota_free_cost','1'::jsonb,'Coût FREE d’une reconnaissance réussie au-delà du quota quotidien.',now()),
  ('referral_free_per_signup','2'::jsonb,'FREE par filleul validé selon la règle active.',now()),
  ('referral_monthly_free_cap','20'::jsonb,'Plafond mensuel FREE de parrainage.',now()),
  ('first_discovery_free_per_keep','1'::jsonb,'FREE versé au premier découvreur quand un autre membre garde le titre.',now()),
  ('first_discovery_monthly_free_cap','20'::jsonb,'Plafond mensuel premier découvreur.',now()),
  ('listen_streak_daily_free','1'::jsonb,'FREE gagné au premier morceau reconnu de la journée.',now()),
  ('listen_streak_day7_bonus_free','5'::jsonb,'Bonus FREE au 7e jour consécutif.',now()),
  ('listen_streak_paid_freeze_per_month','1'::jsonb,'Gel mensuel de série pour une formule payante.',now())
on conflict(key) do update
set value=excluded.value,description=excluded.description,updated_at=now();

-- Supprime uniquement les alias créés par la migration concurrente. Les clés
-- historiques guest_success_limit/signup_bonus_successes restent conservées
-- car elles servent au grandfathering des comptes antérieurs au 04/10.
delete from public.remote_config
where key in (
  'guest_listen_total_limit',
  'signup_bonus_free_new_accounts',
  'referral_v2_free_per_signup',
  'referral_v2_monthly_free_cap'
);

-- Tables uniques de l’économie nouvelle.
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
alter table public.keep_free_economy_events enable row level security;
drop policy if exists keep_free_economy_events_select_own on public.keep_free_economy_events;
create policy keep_free_economy_events_select_own
  on public.keep_free_economy_events for select to authenticated
  using(profile_id=(select auth.uid()));

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

-- Migre le compteur concurrent vers le compteur canonique puis retire le doublon.
do $$
begin
  if to_regclass('public.listen_success_events') is not null then
    insert into public.keep_listen_success_events(profile_id,source_key,period_key,charged_free,created_at)
    select profile_id,source_key,period_key,charged_free,created_at
    from public.listen_success_events
    on conflict(profile_id,source_key) do nothing;
    execute 'drop table public.listen_success_events';
  end if;
end $$;

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

create or replace function public.keep_free_economy_event_adjustment_for_profile(p_uid uuid)
returns integer language sql stable security definer set search_path=public
as $$
  select coalesce(sum(amount),0)::integer
  from public.keep_free_economy_events where profile_id=p_uid
$$;
revoke all on function public.keep_free_economy_event_adjustment_for_profile(uuid) from public,anon,authenticated;
grant execute on function public.keep_free_economy_event_adjustment_for_profile(uuid) to service_role;

-- Parrainage : ancienne formule uniquement pour l’historique antérieur au
-- message 04/10 ; nouvelle formule +2 sans paliers et plafond 20 ensuite.
create or replace function public.keep_referral_rules()
returns jsonb language sql stable security definer set search_path=public
as $$
 select jsonb_build_object(
  'free_per_signup',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2),
  'bonus_3',0,'bonus_5',0,'bonus_10',0,
  'monthly_cap',coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),20)
 )
$$;
revoke all on function public.keep_referral_rules() from public;
grant execute on function public.keep_referral_rules() to anon,authenticated;

create or replace function public.keep_referral_free_credit_bonus_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path=public
as $$
declare
  cutoff timestamptz:='2026-10-04 20:09:00+02'::timestamptz;
  legacy_per integer:=2; legacy_b3 integer:=3; legacy_b5 integer:=5; legacy_b10 integer:=10; legacy_cap integer:=20;
  new_per integer:=2; new_cap integer:=20; legacy_total integer:=0; new_total integer:=0;
begin
  if p_uid is null then return 0; end if;
  legacy_per:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2);
  legacy_b3:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_3'),3);
  legacy_b5:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_5'),5);
  legacy_b10:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_bonus_10'),10);
  legacy_cap:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),20);
  new_per:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_free_per_signup'),2);
  new_cap:=coalesce((select (value #>> '{}')::integer from public.remote_config where key='referral_monthly_free_cap'),20);

  select coalesce(sum(least(legacy_cap,c*legacy_per
    +case when c>=3 then legacy_b3 else 0 end
    +case when c>=5 then legacy_b5 else 0 end
    +case when c>=10 then legacy_b10 else 0 end)),0)::integer
  into legacy_total
  from (
    select date_trunc('month',qualified_at) m,count(*)::integer c
    from public.keep_referrals
    where referrer_profile_id=p_uid and qualified_at<cutoff
    group by 1
  ) q;

  select coalesce(sum(least(new_cap,c*new_per)),0)::integer
  into new_total
  from (
    select date_trunc('month',qualified_at) m,count(*)::integer c
    from public.keep_referrals
    where referrer_profile_id=p_uid and qualified_at>=cutoff
    group by 1
  ) q;
  return legacy_total+new_total;
end;
$$;

create or replace function public.keep_referral_status()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  cutoff timestamptz:='2026-10-04 20:09:00+02'::timestamptz;
  month_count integer:=0; lifetime_count integer:=0; month_bonus integer:=0; total_bonus integer:=0; r jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select public.keep_referral_rules() into r;
  select count(*)::integer into month_count
  from public.keep_referrals
  where referrer_profile_id=uid
    and qualified_at>=greatest(date_trunc('month',now()),cutoff);
  select count(*)::integer into lifetime_count from public.keep_referrals where referrer_profile_id=uid;
  month_bonus:=least((r->>'monthly_cap')::integer,month_count*(r->>'free_per_signup')::integer);
  total_bonus:=public.keep_referral_free_credit_bonus_for_profile(uid);
  return r||jsonb_build_object(
    'month_referrals',month_count,'lifetime_referrals',lifetime_count,
    'month_free_earned',month_bonus,'total_free_earned',total_bonus,
    'code',public.keep_my_referral_code()
  );
end;
$$;
revoke all on function public.keep_referral_status() from public;
grant execute on function public.keep_referral_status() to authenticated;

-- Solde unique : anciennes sources + récompenses économie - dépenses écoute.
create or replace function public.keep_theoretical_free_credit_remaining_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path to 'public','auth'
as $$
declare
  guest_limit integer:=3; signup_bonus integer:=0; follower_count integer:=0; follower_bonus integer:=0;
  f3 integer; f5 integer; f250c integer; f1000c integer;
  referral_bonus integer:=0; monthly_bonus integer:=0; admin_grant integer:=0;
  battle_adjustment integer:=0; marketplace_adjustment integer:=0; economy_adjustment integer:=0;
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
  economy_adjustment:=public.keep_free_economy_event_adjustment_for_profile(p_uid);
  solo_pack_spent:=public.keep_battle_solo_pack_spent_for_profile(p_uid);
  listen_spent:=public.keep_listen_free_spent_for_profile(p_uid);
  ledger_used:=coalesce((select consumed_count from public.download_credit_usage where profile_id=p_uid),0);
  derived_used:=public.keep_chargeable_keep_count(p_uid);
  used:=greatest(ledger_used,derived_used)+listen_spent;
  capacity:=greatest(used,
    guest_limit+signup_bonus+follower_bonus+referral_bonus+monthly_bonus+admin_grant
    +battle_adjustment+marketplace_adjustment+economy_adjustment-solo_pack_spent
  );
  return greatest(0,capacity-used);
end;
$$;

create or replace function public.keep_apply_listen_streak(p_uid uuid,p_day date,p_plan_code text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  s public.keep_listen_streaks%rowtype; next_streak integer:=1; freeze_used boolean:=false;
  month_key text:=to_char(p_day,'YYYY-MM'); daily_reward integer:=1; week_reward integer:=5; reward integer:=0;
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
    if found then reward:=reward+daily_reward; end if;
  end if;
  if next_streak%7=0 and week_reward>0 then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(p_uid,week_reward,'LISTEN_STREAK_WEEK','STREAK_WEEK:'||p_day::text,jsonb_build_object('day',p_day,'streak',next_streak))
    on conflict(profile_id,source_key) do nothing;
    if found then reward:=reward+week_reward; end if;
  end if;
  insert into public.keep_listen_streaks(profile_id,current_streak,last_success_day,freeze_month,updated_at)
  values(p_uid,next_streak,p_day,case when freeze_used then month_key else null end,now())
  on conflict(profile_id) do update set
    current_streak=excluded.current_streak,last_success_day=excluded.last_success_day,
    freeze_month=case when freeze_used then month_key else public.keep_listen_streaks.freeze_month end,
    updated_at=now();
  return jsonb_build_object('streak',next_streak,'reward',reward,'freezeUsed',freeze_used);
end;
$$;
revoke all on function public.keep_apply_listen_streak(uuid,date,text) from public,anon,authenticated;
grant execute on function public.keep_apply_listen_streak(uuid,date,text) to service_role;

-- Statut utilisateur. Au-delà du quota, l’écoute n’est PAS autorisée
-- automatiquement même si le solde permet de payer : le consentement 1 FREE
-- est explicite côté UI.
create or replace function public.keep_listen_status(p_timezone text default 'Europe/Paris')
returns jsonb language plpgsql stable security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid(); v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_anon boolean:=false; v_plan text:='FREE'; v_period_key text; v_used integer:=0; v_limit integer:=0;
  v_free_balance integer:=0; v_cost integer:=1; v_over boolean:=false;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_anon:=coalesce((select is_anonymous from auth.users where id=uid),false);
  v_plan:=public.keep_active_plan_code(uid);
  if v_anon then
    v_period_key:='LIFETIME';
    v_limit:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit'),3));
  else
    v_period_key:=(now() at time zone v_tz)::date::text;
    v_limit:=greatest(1,coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),5));
  end if;
  select coalesce(c.used_count,0) into v_used
  from public.feature_usage_counters c
  where c.profile_id=uid and c.feature_key='LISTEN_DAILY' and c.period_key=v_period_key;
  v_used:=coalesce(v_used,0);
  v_cost:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost'),1));
  v_free_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
  v_over:=v_used>=v_limit;
  return jsonb_build_object(
    'planCode',v_plan,'isAnonymous',v_anon,'featureKey','LISTEN_DAILY','periodKey',v_period_key,
    'used',v_used,'limit',v_limit,'includedRemaining',greatest(0,v_limit-v_used),
    'overQuota',v_over,'overQuotaFreeCost',v_cost,'freeBalance',v_free_balance,
    'canListen',not v_over,'canPayWithFree',(not v_anon and v_free_balance>=v_cost),'timezone',v_tz
  );
end;
$$;
revoke all on function public.keep_listen_status(text) from public,anon;
grant execute on function public.keep_listen_status(text) to authenticated;

-- Retire l’ancienne surcharge auto-débitante puis expose une seule version.
drop function if exists public.keep_record_listen_success(text,text);
drop function if exists public.keep_record_listen_success(text,text,boolean);
create function public.keep_record_listen_success(
  p_source_key text,
  p_timezone text default 'Europe/Paris',
  p_allow_free boolean default false
)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid(); v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_source text:=left(trim(coalesce(p_source_key,'')),160); v_anon boolean:=false; v_plan text:='FREE';
  v_period_key text; v_day date; v_used integer:=0; v_limit integer:=0; v_cost integer:=1; v_balance integer:=0;
  v_charge integer:=0; v_result jsonb; v_streak jsonb:='{}'::jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if v_source='' then raise exception 'listen_source_key_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.keep_listen_success_events where profile_id=uid and source_key=v_source) then
    v_result:=public.keep_listen_status(v_tz);
    return v_result||jsonb_build_object('ok',true,'deduplicated',true,'chargedFree',0);
  end if;
  v_anon:=coalesce((select is_anonymous from auth.users where id=uid),false);
  v_plan:=public.keep_active_plan_code(uid);
  v_day:=(now() at time zone v_tz)::date;
  if v_anon then
    v_period_key:='LIFETIME';
    v_limit:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit'),3));
  else
    v_period_key:=v_day::text;
    v_limit:=greatest(1,coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),5));
  end if;
  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(uid,'LISTEN_DAILY',v_period_key,0,now())
  on conflict(profile_id,feature_key,period_key) do nothing;
  select c.used_count into v_used from public.feature_usage_counters c
  where c.profile_id=uid and c.feature_key='LISTEN_DAILY' and c.period_key=v_period_key for update;
  v_used:=coalesce(v_used,0);
  if v_anon and v_used>=v_limit then
    return public.keep_listen_status(v_tz)||jsonb_build_object('ok',false,'reason','GUEST_LIMIT_REACHED','chargedFree',0);
  end if;
  v_cost:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost'),1));
  if not v_anon and v_used>=v_limit then
    if not p_allow_free then
      return public.keep_listen_status(v_tz)||jsonb_build_object('ok',false,'reason','FREE_REQUIRED','chargedFree',0);
    end if;
    v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(uid);
    if v_balance<v_cost then
      return public.keep_listen_status(v_tz)||jsonb_build_object('ok',false,'reason','FREE_REQUIRED','chargedFree',0);
    end if;
    v_charge:=v_cost;
  end if;
  insert into public.keep_listen_success_events(profile_id,source_key,period_key,charged_free,created_at)
  values(uid,v_source,v_period_key,v_charge,now());
  if v_charge>0 then
    insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
    values(uid,v_charge,'LISTEN_OVER_QUOTA','LISTEN:'||v_source,now())
    on conflict do nothing;
  end if;
  update public.feature_usage_counters
  set used_count=v_used+1,updated_at=now()
  where profile_id=uid and feature_key='LISTEN_DAILY' and period_key=v_period_key;
  perform public.service_record_recognition_success(uid);
  if not v_anon then v_streak:=public.keep_apply_listen_streak(uid,v_day,v_plan); end if;
  v_result:=public.keep_listen_status(v_tz);
  return v_result||jsonb_build_object('ok',true,'deduplicated',false,'chargedFree',v_charge,'streak',v_streak);
end;
$$;
revoke all on function public.keep_record_listen_success(text,text,boolean) from public,anon;
grant execute on function public.keep_record_listen_success(text,text,boolean) to authenticated;

-- Service role : même compteur/ledger, pour les reconnaissances payantes
-- validées par les Edge Functions. Aucun double comptage avec une source_key.
create or replace function public.service_record_listen_success(
  p_profile_id uuid,p_source_key text,p_timezone text default 'Europe/Paris',p_allow_free boolean default false
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris'); v_period_key text; v_day date;
  v_plan text:='FREE'; v_limit integer:=5; v_used integer:=0; v_cost integer:=1; v_balance integer:=0; v_charge integer:=0;
  v_streak jsonb:='{}'::jsonb;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('recorded',false,'reason','PROFILE_REQUIRED');
  end if;
  if nullif(trim(coalesce(p_source_key,'')),'') is null then return jsonb_build_object('recorded',false,'reason','SOURCE_KEY_REQUIRED'); end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text,0));
  if exists(select 1 from public.keep_listen_success_events where profile_id=p_profile_id and source_key=p_source_key) then
    return jsonb_build_object('recorded',true,'duplicate',true,'chargedFree',0);
  end if;
  v_day:=(now() at time zone v_tz)::date; v_period_key:=v_day::text;
  v_plan:=public.keep_active_plan_code(p_profile_id);
  v_limit:=greatest(1,coalesce(public.keep_plan_limit(v_plan,'listens_per_day'),case v_plan when 'PREMIUM' then 30 when 'CREATOR_PRO' then 60 when 'VENUE_PRO' then 150 else 5 end));
  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(p_profile_id,'LISTEN_DAILY',v_period_key,0,now())
  on conflict(profile_id,feature_key,period_key) do nothing;
  select c.used_count into v_used from public.feature_usage_counters c
  where c.profile_id=p_profile_id and c.feature_key='LISTEN_DAILY' and c.period_key=v_period_key for update;
  v_used:=coalesce(v_used,0);
  v_cost:=greatest(1,coalesce((select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost'),1));
  if v_used>=v_limit then
    if not p_allow_free then return jsonb_build_object('recorded',false,'reason','LISTEN_FREE_REQUIRED','used',v_used,'limit',v_limit); end if;
    v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
    if v_balance<v_cost then return jsonb_build_object('recorded',false,'reason','INSUFFICIENT_FREE','used',v_used,'limit',v_limit,'freeBalance',v_balance); end if;
    v_charge:=v_cost;
  end if;
  insert into public.keep_listen_success_events(profile_id,source_key,period_key,charged_free,created_at)
  values(p_profile_id,p_source_key,v_period_key,v_charge,now());
  if v_charge>0 then
    insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
    values(p_profile_id,v_charge,'LISTEN_OVER_QUOTA','LISTEN:'||p_source_key,now()) on conflict do nothing;
  end if;
  update public.feature_usage_counters set used_count=v_used+1,updated_at=now()
  where profile_id=p_profile_id and feature_key='LISTEN_DAILY' and period_key=v_period_key;
  perform public.service_record_recognition_success(p_profile_id);
  v_streak:=public.keep_apply_listen_streak(p_profile_id,v_day,v_plan);
  v_balance:=public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id);
  return jsonb_build_object(
    'recorded',true,'duplicate',false,'chargedFree',v_charge,'used',v_used+1,'limit',v_limit,
    'remainingIncluded',greatest(v_limit-v_used-1,0),'freeBalance',v_balance,'periodKey',v_period_key,'planCode',v_plan,'streak',v_streak
  );
end;
$$;
revoke all on function public.service_record_listen_success(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.service_record_listen_success(uuid,text,text,boolean) to service_role;

create or replace function public.keep_reward_first_discoverer_on_keep()
returns trigger language plpgsql security definer set search_path=public
as $$
declare discoverer uuid; cap integer:=20; reward integer:=1; month_reward integer:=0;
begin
  if new.decision<>'KEPT' then return new; end if;
  select profile_id into discoverer from public.keep_track_first_discoveries where track_id=new.track_id;
  if discoverer is null or discoverer=new.profile_id then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(discoverer::text,0));
  cap:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_monthly_free_cap'),20));
  reward:=greatest(0,coalesce((select (value #>> '{}')::integer from public.remote_config where key='first_discovery_free_per_keep'),1));
  select coalesce(sum(amount),0)::integer into month_reward
  from public.keep_first_discovery_credit_events
  where first_discoverer_id=discoverer and created_at>=date_trunc('month',now());
  if reward=0 or month_reward+reward>cap then return new; end if;
  insert into public.keep_first_discovery_credit_events(first_discoverer_id,keeper_profile_id,track_id,keep_decision_id,amount)
  values(discoverer,new.profile_id,new.track_id,new.id,reward)
  on conflict(keep_decision_id) do nothing;
  if found then
    insert into public.keep_free_economy_events(profile_id,amount,event_type,source_key,metadata)
    values(discoverer,reward,'FIRST_DISCOVERY_KEEP','FIRST_DISCOVERY:'||new.id::text,
      jsonb_build_object('trackId',new.track_id,'keeperProfileId',new.profile_id,'keepDecisionId',new.id))
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

create or replace function public.keep_free_wallet_status(p_timezone text default 'Europe/Paris')
returns jsonb language plpgsql stable security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid(); v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone; v_start timestamptz; v_end timestamptz; v_balance integer:=0;
  v_battle_earned integer:=0; v_solo_earned integer:=0; v_bonus_earned integer:=0; v_admin_earned integer:=0;
  v_marketplace_earned integer:=0; v_economy_earned integer:=0; v_streak_earned integer:=0; v_discovery_earned integer:=0;
  v_recharge_earned integer:=0; v_lost integer:=0; v_keep_spent integer:=0; v_keep_count integer:=0;
  v_listen_spent integer:=0; v_listen_paid_count integer:=0; v_marketplace_spent integer:=0; v_marketplace_purchase_count integer:=0;
  v_earned integer:=0; v_spent integer:=0; v_streak integer:=0;
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
  select coalesce(sum(greatest(amount,0)),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type like 'LISTEN_STREAK%'),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type='FIRST_DISCOVERY_KEEP'),0)::integer,
    coalesce(sum(greatest(amount,0)) filter(where event_type='IAP_RECHARGE'),0)::integer
  into v_economy_earned,v_streak_earned,v_discovery_earned,v_recharge_earned
  from public.keep_free_economy_events where profile_id=uid and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount,0)) filter(where reason='KEEP_PROFILE'),0)::integer,
    count(*) filter(where reason='KEEP_PROFILE')::integer,
    coalesce(sum(greatest(amount,0)) filter(where reason='LISTEN_OVER_QUOTA'),0)::integer,
    count(*) filter(where reason='LISTEN_OVER_QUOTA')::integer
  into v_keep_spent,v_keep_count,v_listen_spent,v_listen_paid_count
  from public.keep_free_spend_events where profile_id=uid and created_at>=v_start and created_at<v_end;
  select coalesce(sum(greatest(amount_free,0)),0)::integer,count(*)::integer into v_marketplace_spent,v_marketplace_purchase_count
  from public.playlist_sale_payments where buyer_id=uid and provider='FREE_CREDITS' and status='COMPLETED' and coalesce(delivered_at,created_at)>=v_start and coalesce(delivered_at,created_at)<v_end;
  select coalesce(current_streak,0) into v_streak from public.keep_listen_streaks where profile_id=uid;
  v_streak:=coalesce(v_streak,0);
  v_earned:=v_battle_earned+v_solo_earned+v_bonus_earned+v_admin_earned+v_marketplace_earned+v_economy_earned;
  v_spent:=v_keep_spent+v_listen_spent+v_marketplace_spent;
  return jsonb_build_object(
    'balance',v_balance,'earnedToday',v_earned,'lostToday',v_lost,'spentToday',v_spent,'netToday',v_earned-v_lost-v_spent,
    'battleEarnedToday',v_battle_earned,'soloEarnedToday',v_solo_earned,'bonusEarnedToday',v_bonus_earned,'adminEarnedToday',v_admin_earned,
    'marketplaceEarnedToday',v_marketplace_earned,'economyEarnedToday',v_economy_earned,'streakEarnedToday',v_streak_earned,
    'discoveryEarnedToday',v_discovery_earned,'rechargeEarnedToday',v_recharge_earned,'keepSpentToday',v_keep_spent,'keepCountToday',v_keep_count,
    'listenSpentToday',v_listen_spent,'listenPaidCountToday',v_listen_paid_count,'marketplaceSpentToday',v_marketplace_spent,
    'marketplacePurchaseCountToday',v_marketplace_purchase_count,'listenStreak',v_streak,
    'period','TODAY_2AM','timezone',v_tz,'startedAt',v_start,'endsAt',v_end
  );
end;
$$;
revoke all on function public.keep_free_wallet_status(text) from public,anon;
grant execute on function public.keep_free_wallet_status(text) to authenticated;
