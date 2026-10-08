-- Atomic KEEP + FREE debit.
-- One server transaction now owns: de-duplication -> FREE debit -> keep_decision insert.
-- This prevents both "kept but not charged" and "charged but keep insert failed".

create or replace function public.keep_consume_download_credit_for_source(p_source_key text default null)
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  st record;
  used integer := 0;
  cost integer := 1;
  month_key text := to_char(now(),'YYYY-MM');
  monthly_cap integer;
  monthly_used integer := 0;
  daily_cap integer;
  daily_used integer := 0;
  day_key text := to_char(now() at time zone 'UTC','YYYY-MM-DD');
  v_source text := nullif(left(trim(coalesce(p_source_key,'')),120),'');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  cost := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1), 1));
  select * into st from public.keep_download_credit_status();

  daily_cap := public.keep_plan_limit(st.plan_code,'downloads_per_day');
  select used_count into daily_used
  from public.feature_usage_counters
  where profile_id=uid and feature_key='KEEP_DAILY' and period_key=day_key;
  daily_used:=coalesce(daily_used,0);
  if daily_cap is not null and daily_used>=daily_cap then raise exception 'download_daily_limit_reached'; end if;

  if st.unlimited then
    allowed := true;
    plan_code := st.plan_code;
    consumed := st.consumed;
    credit_limit := null;
    remaining := null;
    unlimited := true;
    return next;
    return;
  end if;

  if st.plan_code='FREE' then
    monthly_cap := public.keep_plan_limit('FREE','keeps_per_month');
    if monthly_cap is not null then
      insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
      values(uid,'KEEP_MONTHLY',month_key,0,now())
      on conflict(profile_id,feature_key,period_key) do nothing;

      select used_count into monthly_used
      from public.feature_usage_counters
      where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key
      for update;
      monthly_used:=coalesce(monthly_used,0);

      if monthly_used>=monthly_cap then
        allowed:=false;
        plan_code:=st.plan_code;
        consumed:=st.consumed;
        credit_limit:=st.credit_limit;
        remaining:=st.remaining;
        unlimited:=false;
        return next;
        return;
      end if;
    end if;
  end if;

  insert into public.download_credit_usage(profile_id,consumed_count,updated_at)
  values(uid,0,now())
  on conflict(profile_id) do nothing;

  select d.consumed_count into used
  from public.download_credit_usage d
  where d.profile_id=uid
  for update;

  select * into st from public.keep_download_credit_status();
  used:=greatest(used,st.consumed);

  if coalesce(st.remaining,0)<cost or used+cost>coalesce(st.credit_limit,0) then
    allowed:=false;
    plan_code:=st.plan_code;
    consumed:=used;
    credit_limit:=st.credit_limit;
    remaining:=greatest(0,coalesce(st.remaining,0));
    unlimited:=false;
    return next;
    return;
  end if;

  used:=used+cost;
  update public.download_credit_usage
  set consumed_count=used,updated_at=now()
  where profile_id=uid;

  insert into public.keep_free_spend_events(profile_id,amount,reason,source_key,created_at)
  values(uid,cost,'KEEP_PROFILE',v_source,now());

  if st.plan_code='FREE' and monthly_cap is not null then
    update public.feature_usage_counters
    set used_count=monthly_used+1,updated_at=now()
    where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key;
  end if;

  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(uid,'KEEP_DAILY',day_key,1,now())
  on conflict(profile_id,feature_key,period_key) do update
    set used_count=public.feature_usage_counters.used_count+1,updated_at=now();

  allowed:=true;
  plan_code:=st.plan_code;
  consumed:=used;
  credit_limit:=st.credit_limit;
  remaining:=greatest(0,st.credit_limit-used);
  unlimited:=false;
  return next;
end;
$function$;

revoke all on function public.keep_consume_download_credit_for_source(text) from public,anon;
grant execute on function public.keep_consume_download_credit_for_source(text) to authenticated,service_role;

create or replace function public.keep_consume_download_credit()
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language sql
security definer
set search_path=public,auth
as $function$
  select * from public.keep_consume_download_credit_for_source(null);
$function$;

revoke all on function public.keep_consume_download_credit() from public,anon;
grant execute on function public.keep_consume_download_credit() to authenticated,service_role;

create or replace function public.keep_commit_paid_decision(
  p_track_id uuid,
  p_visibility text default 'PRIVATE',
  p_context jsonb default '{}'::jsonb,
  p_source_profile_id uuid default null,
  p_source_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE'))='PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_existing public.keep_decisions%rowtype;
  v_origin uuid := null;
  v_credit record;
  v_row public.keep_decisions%rowtype;
  v_source_profile uuid := case when p_source_profile_id is distinct from uid then p_source_profile_id else null end;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null then raise exception 'track_required'; end if;
  if not exists(select 1 from public.tracks where id=p_track_id) then raise exception 'track_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select * into v_existing
  from public.keep_decisions
  where profile_id=uid and track_id=p_track_id and decision='KEPT'
  limit 1
  for update;

  if found then
    if v_existing.visibility is distinct from v_visibility then
      update public.keep_decisions
      set visibility=v_visibility
      where id=v_existing.id
      returning * into v_existing;
    end if;

    return jsonb_build_object(
      'ok',true,
      'trackId',p_track_id,
      'decisionId',v_existing.id,
      'createdAt',v_existing.created_at,
      'visibility',v_existing.visibility,
      'deduplicated',true,
      'charged',0
    );
  end if;

  if v_source_profile is not null then
    select coalesce(k.source_user_id,v_source_profile)
      into v_origin
    from public.keep_decisions k
    where k.profile_id=v_source_profile
      and k.track_id=p_track_id
      and k.decision='KEPT'
      and k.visibility='PUBLIC'
    limit 1;
    v_origin:=coalesce(v_origin,v_source_profile);
  end if;

  select * into v_credit
  from public.keep_consume_download_credit_for_source(coalesce(nullif(trim(p_source_key),''),'unknown'));

  if not coalesce(v_credit.allowed,false) then
    raise exception 'CREDITS_EXHAUSTED';
  end if;

  insert into public.keep_decisions(
    profile_id,track_id,decision,visibility,
    recommended_playlist_id,chosen_playlist_id,was_correction,
    context,source_type,source_user_id
  )
  values(
    uid,p_track_id,'KEPT',v_visibility,
    null,null,false,
    coalesce(p_context,'{}'::jsonb),
    case when v_source_profile is not null then 'profile' else null end,
    v_origin
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'trackId',p_track_id,
    'decisionId',v_row.id,
    'createdAt',v_row.created_at,
    'visibility',v_row.visibility,
    'deduplicated',false,
    'charged',coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1),1),
    'sourceKey',coalesce(nullif(trim(p_source_key),''),'unknown')
  );
end;
$function$;

revoke all on function public.keep_commit_paid_decision(uuid,text,jsonb,uuid,text) from public,anon;
grant execute on function public.keep_commit_paid_decision(uuid,text,jsonb,uuid,text) to authenticated,service_role;
