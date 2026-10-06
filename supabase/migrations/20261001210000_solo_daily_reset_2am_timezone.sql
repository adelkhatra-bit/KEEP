-- Align Solo daily quota with the product day used by FREE counters: 02:00 -> 01:59 in the user's timezone.

create or replace function public.keep_battle_solo_daily_status(p_timezone text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  uid uuid := auth.uid();
  lim integer;
  used integer := 0;
  plan text;
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_usage_date date;
  v_next_reset timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_usage_date := ((now() at time zone v_tz) - interval '2 hours')::date;
  v_next_reset := ((v_usage_date + 1)::timestamp + interval '2 hours') at time zone v_tz;

  plan := public.keep_active_plan_code(uid);
  lim := public.keep_battle_solo_daily_limit_for_profile(uid);

  select coalesce(starts,0) into used
  from public.keep_battle_solo_daily_usage
  where profile_id=uid and usage_date=v_usage_date;

  used := coalesce(used,0);
  return jsonb_build_object(
    'plan',plan,
    'used',used,
    'limit',lim,
    'remaining',greatest(0,lim-used),
    'unlimited',false,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'resetsAt',v_next_reset
  );
end;
$function$;

revoke all on function public.keep_battle_solo_daily_status(text) from public,anon;
grant execute on function public.keep_battle_solo_daily_status(text) to authenticated;

create or replace function public.keep_battle_solo_consume_daily_start(p_session_token text,p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  uid uuid := auth.uid();
  v_token text := trim(coalesce(p_session_token,''));
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_usage_date date;
  v_next_reset timestamptz;
  v_limit integer;
  v_starts integer;
  v_plan text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_token)<8 or char_length(v_token)>160 then
    raise exception 'BATTLE_SOLO_SESSION_TOKEN_INVALID';
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_usage_date := ((now() at time zone v_tz)-interval '2 hours')::date;
  v_next_reset := ((v_usage_date+1)::timestamp+interval '2 hours') at time zone v_tz;
  v_plan := public.keep_active_plan_code(uid);
  v_limit := public.keep_battle_solo_daily_limit_for_profile(uid);

  insert into public.keep_battle_solo_daily_usage(profile_id,usage_date,starts,updated_at,session_tokens)
  values(uid,v_usage_date,1,now(),array[v_token])
  on conflict(profile_id,usage_date) do update
    set starts=public.keep_battle_solo_daily_usage.starts
      + case when v_token=any(public.keep_battle_solo_daily_usage.session_tokens) then 0 else 1 end,
        session_tokens=case
          when v_token=any(public.keep_battle_solo_daily_usage.session_tokens)
            then public.keep_battle_solo_daily_usage.session_tokens
          else array_append(public.keep_battle_solo_daily_usage.session_tokens,v_token)
        end,
        updated_at=now()
    where v_token=any(public.keep_battle_solo_daily_usage.session_tokens)
       or public.keep_battle_solo_daily_usage.starts<v_limit
  returning starts into v_starts;

  if v_starts is null then
    raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%',v_limit;
  end if;

  return jsonb_build_object(
    'used',v_starts,
    'limit',v_limit,
    'remaining',greatest(0,v_limit-v_starts),
    'unlimited',false,
    'plan',v_plan,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'resetsAt',v_next_reset
  );
end;
$function$;

revoke all on function public.keep_battle_solo_consume_daily_start(text,text) from public,anon;
grant execute on function public.keep_battle_solo_consume_daily_start(text,text) to authenticated;
