-- Loki: daily FREE spend must follow the authoritative debit ledger.
-- Social/profile-origin keeps are charged like every other new manual KEEP.
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
  v_spent integer := 0;
  v_keeps integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_local_start := date_trunc('day',(now() at time zone v_tz)-interval '2 hours')+interval '2 hours';
  v_start := v_local_start at time zone v_tz;
  v_end := (v_local_start+interval '1 day') at time zone v_tz;

  select coalesce(sum(e.amount),0)::integer,
         count(*)::integer
    into v_spent,v_keeps
  from public.keep_free_spend_events e
  where e.profile_id=uid
    and e.reason='KEEP_PROFILE'
    and e.created_at>=v_start
    and e.created_at<v_end;

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
grant execute on function public.keep_free_spent_today(text) to authenticated,service_role;
