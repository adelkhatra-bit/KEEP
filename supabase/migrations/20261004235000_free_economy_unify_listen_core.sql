-- ECONOMIE FREE 04/10/2026 — un seul coeur serveur pour les écoutes membre.
-- keep_* (client authentifié) et service_* (Edge Functions) délèguent à la
-- même logique et écrivent dans les mêmes compteurs / ledgers.

create or replace function public.service_listen_status_for_profile(
  p_profile_id uuid,
  p_timezone text default 'Europe/Paris'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_anon boolean:=false;
  v_plan text:='FREE';
  v_period_key text;
  v_used integer:=0;
  v_limit integer:=0;
  v_cost integer:=1;
  v_balance integer:=0;
  v_over boolean:=false;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('ok',false,'reason','PROFILE_REQUIRED');
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_anon:=coalesce((select u.is_anonymous from auth.users u where u.id=p_profile_id),false);
  v_plan:=public.keep_active_plan_code(p_profile_id);
  if v_anon then
    v_period_key:='LIFETIME';
    v_limit:=greatest(1,coalesce(
      (select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),3
    ));
  else
    v_period_key:=(now() at time zone v_tz)::date::text;
    v_limit:=greatest(1,coalesce(
      public.keep_plan_limit(v_plan,'listens_per_day'),
      case v_plan when 'PREMIUM' then 30 when 'CREATOR_PRO' then 60 when 'VENUE_PRO' then 150 else 5 end
    ));
  end if;

  select coalesce(c.used_count,0) into v_used
  from public.feature_usage_counters c
  where c.profile_id=p_profile_id and c.feature_key='LISTEN_DAILY' and c.period_key=v_period_key;
  v_used:=coalesce(v_used,0);
  v_cost:=greatest(1,coalesce(
    (select (value #>> '{}')::integer from public.remote_config where key='listen_over_quota_free_cost' limit 1),1
  ));
  v_balance:=case when v_anon then 0 else public.keep_theoretical_free_credit_remaining_for_profile(p_profile_id) end;
  v_over:=v_used>=v_limit;

  return jsonb_build_object(
    'ok',true,
    'planCode',v_plan,
    'isAnonymous',v_anon,
    'featureKey','LISTEN_DAILY',
    'periodKey',v_period_key,
    'used',v_used,
    'limit',v_limit,
    'includedRemaining',greatest(0,v_limit-v_used),
    'overQuota',v_over,
    'overQuotaFreeCost',v_cost,
    'freeBalance',v_balance,
    'canListen',not v_over,
    'canPayWithFree',(not v_anon and v_balance>=v_cost),
    'timezone',v_tz
  );
end;
$function$;
revoke all on function public.service_listen_status_for_profile(uuid,text) from public,anon,authenticated;
grant execute on function public.service_listen_status_for_profile(uuid,text) to service_role;

create or replace function public.keep_listen_status(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  return public.service_listen_status_for_profile(uid,p_timezone);
end;
$function$;
revoke all on function public.keep_listen_status(text) from public,anon;
grant execute on function public.keep_listen_status(text) to authenticated;

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
declare s jsonb; v_over boolean; v_anon boolean; v_can_pay boolean;
begin
  s:=public.service_listen_status_for_profile(p_profile_id,p_timezone);
  if coalesce((s->>'ok')::boolean,false)=false then
    return jsonb_build_object('allowed',false,'reason',coalesce(s->>'reason','PROFILE_REQUIRED'));
  end if;
  v_over:=coalesce((s->>'overQuota')::boolean,false);
  v_anon:=coalesce((s->>'isAnonymous')::boolean,false);
  v_can_pay:=coalesce((s->>'canPayWithFree')::boolean,false);
  return s || jsonb_build_object(
    'allowed',case
      when not v_over then true
      when v_anon then false
      when p_allow_free and v_can_pay then true
      else false
    end,
    'requiresFree',(v_over and not v_anon),
    'reason',case
      when not v_over then null
      when v_anon then 'GUEST_LISTEN_LIMIT_REACHED'
      when not p_allow_free then 'LISTEN_FREE_REQUIRED'
      when not v_can_pay then 'INSUFFICIENT_FREE'
      else null
    end,
    'freeCost',coalesce((s->>'overQuotaFreeCost')::integer,1)
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
set search_path=public,auth
as $function$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_source text:=left(trim(coalesce(p_source_key,'')),160);
  s jsonb;
  v_anon boolean:=false;
  v_plan text:='FREE';
  v_period_key text;
  v_day date;
  v_used integer:=0;
  v_limit integer:=0;
  v_cost integer:=1;
  v_balance integer:=0;
  v_charge integer:=0;
  v_streak jsonb:='{}'::jsonb;
  v_existing integer:=0;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('recorded',false,'ok',false,'reason','PROFILE_REQUIRED');
  end if;
  if v_source='' then return jsonb_build_object('recorded',false,'ok',false,'reason','SOURCE_KEY_REQUIRED'); end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text,0));

  select e.charged_free into v_existing
  from public.keep_listen_success_events e
  where e.profile_id=p_profile_id and e.source_key=v_source;
  if found then
    s:=public.service_listen_status_for_profile(p_profile_id,v_tz);
    return s || jsonb_build_object(
      'recorded',true,'ok',true,'duplicate',true,'deduplicated',true,'chargedFree',0,'originalChargedFree',v_existing
    );
  end if;

  s:=public.service_listen_status_for_profile(p_profile_id,v_tz);
  if coalesce((s->>'ok')::boolean,false)=false then
    return s || jsonb_build_object('recorded',false,'ok',false);
  end if;

  v_anon:=coalesce((s->>'isAnonymous')::boolean,false);
  v_plan:=coalesce(s->>'planCode','FREE');
  v_period_key:=coalesce(s->>'periodKey','');
  v_used:=coalesce((s->>'used')::integer,0);
  v_limit:=greatest(1,coalesce((s->>'limit')::integer,5));
  v_cost:=greatest(1,coalesce((s->>'overQuotaFreeCost')::integer,1));
  v_balance:=coalesce((s->>'freeBalance')::integer,0);
  v_day:=(now() at time zone v_tz)::date;

  if v_used>=v_limit then
    if v_anon then
      return s || jsonb_build_object('recorded',false,'ok',false,'reason','GUEST_LISTEN_LIMIT_REACHED','chargedFree',0);
    end if;
    if not p_allow_free then
      return s || jsonb_build_object('recorded',false,'ok',false,'reason','LISTEN_FREE_REQUIRED','chargedFree',0);
    end if;
    if v_balance<v_cost then
      return s || jsonb_build_object('recorded',false,'ok',false,'reason','INSUFFICIENT_FREE','chargedFree',0);
    end if;
    v_charge:=v_cost;
  end if;

  insert into public.keep_listen_success_events(profile_id,source_key,period_key,charged_free,created_at)
  values(p_profile_id,v_source,v_period_key,v_charge,now());

  if v_charge>0 then
    insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
    values(p_profile_id,v_charge,'LISTEN_OVER_QUOTA','LISTEN:'||v_source,now())
    on conflict do nothing;
  end if;

  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(p_profile_id,'LISTEN_DAILY',v_period_key,1,now())
  on conflict(profile_id,feature_key,period_key) do update
    set used_count=public.feature_usage_counters.used_count+1,updated_at=now();

  perform public.service_record_recognition_success(p_profile_id);
  if not v_anon then v_streak:=public.keep_apply_listen_streak(p_profile_id,v_day,v_plan); end if;

  s:=public.service_listen_status_for_profile(p_profile_id,v_tz);
  return s || jsonb_build_object(
    'recorded',true,'ok',true,'duplicate',false,'deduplicated',false,
    'chargedFree',v_charge,'streak',v_streak
  );
end;
$function$;
revoke all on function public.service_record_listen_success(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.service_record_listen_success(uuid,text,text,boolean) to service_role;

create or replace function public.keep_record_listen_success(
  p_source_key text,
  p_timezone text default 'Europe/Paris',
  p_allow_free boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  return public.service_record_listen_success(uid,p_source_key,p_timezone,p_allow_free);
end;
$function$;
revoke all on function public.keep_record_listen_success(text,text,boolean) from public,anon;
grant execute on function public.keep_record_listen_success(text,text,boolean) to authenticated;
