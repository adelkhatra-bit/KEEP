-- Atomic paid KEEP + robust daily FREE reconciliation.
-- Session, Loki Pulse and any manual KEEP share one server transaction:
-- decision + debit + daily ledger. Duplicates are free/idempotent.

create or replace function public.keep_record_paid_decision(
  p_track_id uuid,
  p_visibility text default 'PRIVATE',
  p_context jsonb default '{}'::jsonb,
  p_source_type text default null,
  p_source_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE'))='PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_existing record;
  v_debit record;
  v_id uuid;
  v_created_at timestamptz;
  v_source_key text;
  v_zero_credit boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null or not exists(select 1 from public.tracks t where t.id=p_track_id) then
    raise exception 'track_not_found';
  end if;

  -- Same user + same track can never be charged twice, even with concurrent taps.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_track_id::text,0));

  select kd.id,kd.created_at,kd.visibility
    into v_existing
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.track_id=p_track_id
    and kd.decision='KEPT'
  limit 1;

  if found then
    if v_existing.visibility is distinct from v_visibility then
      update public.keep_decisions
      set visibility=v_visibility
      where id=v_existing.id;
    end if;
    return jsonb_build_object(
      'ok',true,
      'trackId',p_track_id,
      'decisionId',v_existing.id,
      'createdAt',v_existing.created_at,
      'visibility',v_visibility,
      'deduplicated',true,
      'charged',false
    );
  end if;

  v_zero_credit :=
    coalesce(p_context->>'creditPolicy','LISTEN_KEEP')='SOCIAL_ZERO_CREDIT'
    or coalesce(p_context->>'source','')='marketplace_purchase';

  if not v_zero_credit then
    select * into v_debit from public.keep_consume_download_credit();
    if not coalesce(v_debit.allowed,false) then
      raise exception 'CREDITS_EXHAUSTED';
    end if;

    -- Attach the debit ledger row to this exact track for audit/idempotency.
    v_source_key := 'keep-track:' || p_track_id::text;
    update public.keep_free_spend_events e
    set source_key=v_source_key
    where e.id=(
      select e2.id
      from public.keep_free_spend_events e2
      where e2.profile_id=uid
        and e2.reason='KEEP_PROFILE'
        and e2.source_key is null
      order by e2.created_at desc,e2.id desc
      limit 1
    )
    and not exists(
      select 1 from public.keep_free_spend_events x
      where x.profile_id=uid and x.source_key=v_source_key
    );
  end if;

  insert into public.keep_decisions(
    profile_id,track_id,decision,visibility,
    recommended_playlist_id,chosen_playlist_id,was_correction,
    context,source_type,source_user_id
  )
  values(
    uid,p_track_id,'KEPT',v_visibility,
    null,null,false,
    coalesce(p_context,'{}'::jsonb),p_source_type,p_source_user_id
  )
  returning id,created_at into v_id,v_created_at;

  return jsonb_build_object(
    'ok',true,
    'trackId',p_track_id,
    'decisionId',v_id,
    'createdAt',v_created_at,
    'visibility',v_visibility,
    'deduplicated',false,
    'charged',not v_zero_credit
  );
end;
$function$;

revoke all on function public.keep_record_paid_decision(uuid,text,jsonb,text,uuid) from public,anon;
grant execute on function public.keep_record_paid_decision(uuid,text,jsonb,text,uuid) to authenticated;

-- A chargeable KEEP is defined by the explicit credit policy, not by whether
-- it came from another profile. Manual social reprises are charged too.
create or replace function public.keep_chargeable_keep_count(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $function$
  select count(*)::integer
  from (
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=p_profile_id
      and kd.decision='KEPT'
      and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP') <> 'SOCIAL_ZERO_CREDIT'
      and coalesce(kd.context->>'source','') <> 'marketplace_purchase'

    union

    select pt.track_id
    from public.playlists pl
    join public.playlist_tracks pt on pt.playlist_id=pl.id
    where pl.owner_id=p_profile_id
      and coalesce(pt.added_via,'KEEP')='KEEP'
      and not exists(
        select 1
        from public.keep_decisions kd
        where kd.profile_id=p_profile_id
          and kd.track_id=pt.track_id
          and kd.decision='KEPT'
          and (
            coalesce(kd.context->>'creditPolicy','LISTEN_KEEP')='SOCIAL_ZERO_CREDIT'
            or coalesce(kd.context->>'source','')='marketplace_purchase'
          )
      )
  ) chargeable;
$function$;

-- Daily panel: authoritative ledger first, persisted paid decisions as repair
-- fallback. Both use the same 02:00 -> 01:59 local day.
create or replace function public.keep_free_spent_today(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_ledger_spent integer := 0;
  v_decision_keeps integer := 0;
  v_cost integer := 3;
  v_spent integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;
  v_cost := greatest(1,coalesce((select (rc.value #>> '{}')::integer from public.remote_config rc where rc.key='free_cost_per_keep' limit 1),3));

  select coalesce(sum(e.amount),0)::integer
    into v_ledger_spent
  from public.keep_free_spend_events e
  where e.profile_id=uid
    and e.reason='KEEP_PROFILE'
    and e.created_at>=v_start
    and e.created_at<v_end;

  select count(*)::integer
    into v_decision_keeps
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.decision='KEPT'
    and kd.created_at>=v_start
    and kd.created_at<v_end
    and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP') <> 'SOCIAL_ZERO_CREDIT'
    and coalesce(kd.context->>'source','') <> 'marketplace_purchase';

  v_spent := greatest(v_ledger_spent,v_decision_keeps*v_cost);

  return jsonb_build_object(
    'spent',v_spent,
    'keeps',v_decision_keeps,
    'ledgerSpent',v_ledger_spent,
    'reconciledSpent',v_decision_keeps*v_cost,
    'costPerKeep',v_cost,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end
  );
end;
$function$;

revoke all on function public.keep_free_spent_today(text) from public,anon;
grant execute on function public.keep_free_spent_today(text) to authenticated,service_role;
