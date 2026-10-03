create or replace function public.keep_battle_solo_daily_status(p_timezone text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_daily integer;
  v_purchased integer;
  v_total integer;
  v_used integer := 0;
  v_plan text;
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_usage_date date;
  v_next_reset timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_usage_date := ((now() at time zone v_tz) - interval '2 hours')::date;
  v_next_reset := ((v_usage_date + 1)::timestamp + interval '2 hours') at time zone v_tz;
  v_plan := public.keep_active_plan_code(uid);
  v_daily := public.keep_battle_solo_plan_limit(uid);
  v_purchased := public.keep_battle_solo_bonus_remaining(uid);
  v_total := v_daily + v_purchased;
  select coalesce(starts,0) into v_used
  from public.keep_battle_solo_daily_usage
  where profile_id=uid and usage_date=v_usage_date;
  v_used := coalesce(v_used,0);
  return jsonb_build_object(
    'plan',v_plan,
    'used',v_used,
    'limit',v_total,
    'remaining',greatest(0,v_total-v_used),
    'dailyIncluded',v_daily,
    'purchasedRemaining',v_purchased,
    'unlimited',false,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'resetsAt',v_next_reset
  );
end;
$function$;

create or replace function public.keep_battle_solo_consume_daily_start(p_session_token text, p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_token text := trim(coalesce(p_session_token,''));
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_usage_date date;
  v_next_reset timestamptz;
  v_daily integer;
  v_purchased integer;
  v_total integer;
  v_starts integer;
  v_plan text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_token)<8 or char_length(v_token)>160 then raise exception 'BATTLE_SOLO_SESSION_TOKEN_INVALID'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_usage_date := ((now() at time zone v_tz)-interval '2 hours')::date;
  v_next_reset := ((v_usage_date+1)::timestamp+interval '2 hours') at time zone v_tz;
  v_plan := public.keep_active_plan_code(uid);
  v_daily := public.keep_battle_solo_plan_limit(uid);
  v_purchased := public.keep_battle_solo_bonus_remaining(uid);
  v_total := v_daily + v_purchased;

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
       or public.keep_battle_solo_daily_usage.starts<v_total
  returning starts into v_starts;

  if v_starts is null then raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%',v_total; end if;

  return jsonb_build_object(
    'used',v_starts,
    'limit',v_total,
    'remaining',greatest(0,v_total-v_starts),
    'dailyIncluded',v_daily,
    'purchasedRemaining',v_purchased,
    'unlimited',false,
    'plan',v_plan,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'resetsAt',v_next_reset
  );
end;
$function$;

create or replace function public.keep_battle_solo_buy_pack(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v record;
  v_balance integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('solo_pack:' || uid::text));
  select * into v from public.keep_battle_solo_pack_price(p_code);
  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  if v_balance < v.free then
    raise exception 'SOLO_PACK_NOT_ENOUGH_FREE' using errcode='P0001', detail = format('need=%s balance=%s', v.free, v_balance);
  end if;

  insert into public.keep_battle_solo_pack_purchases(profile_id, pack_code, solos, free_spent)
  values (uid, upper(p_code), v.solos, v.free);

  insert into public.notifications(profile_id, type, title, body, data)
  values (
    uid,
    'BATTLE_SOLO_PACK',
    '🎯 Solos crédités',
    format('+%s Solos crédités (-%s Free). Ils restent disponibles jusqu’à utilisation. Aucun renouvellement automatique.', v.solos, v.free),
    jsonb_build_object('pack', upper(p_code), 'solos', v.solos, 'creditDelta', -v.free)
  );

  return jsonb_build_object(
    'solosAdded', v.solos,
    'freeSpent', v.free,
    'balance', public.keep_theoretical_free_credit_remaining_for_profile(uid),
    'purchasedRemaining', public.keep_battle_solo_bonus_remaining(uid)
  );
end;
$function$;
