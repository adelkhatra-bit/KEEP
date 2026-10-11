-- Profile FREE panel: "spent today" is ONLY music added to the user's profile.
-- Battle, events, marketplace, dating/social and any future FREE reason must never
-- be mixed into this number.
create or replace function public.keep_free_spent_today(p_timezone text default 'Europe/Paris')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_local_start timestamp without time zone;
  v_start timestamptz;
  v_end timestamptz;
  v_spent integer := 0;
  v_keeps integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;

  select coalesce(sum(e.amount),0)::integer
    into v_spent
  from public.keep_free_spend_events e
  where e.profile_id=uid
    and e.reason='KEEP_PROFILE'
    and e.created_at>=v_start
    and e.created_at<v_end;

  select count(*)::integer
    into v_keeps
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.decision='KEPT'
    and kd.created_at>=v_start
    and kd.created_at<v_end
    and kd.source_user_id is null
    and coalesce(kd.source_type,'') <> 'profile'
    and coalesce(kd.context->>'creditPolicy','LISTEN_KEEP')='LISTEN_KEEP';

  return jsonb_build_object(
    'spent',v_spent,
    'keeps',v_keeps,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'startedAt',v_start,
    'endsAt',v_end,
    'reason','KEEP_PROFILE'
  );
end;
$function$;

revoke all on function public.keep_free_spent_today(text) from public,anon;
grant execute on function public.keep_free_spent_today(text) to authenticated;
