-- Clarify the two independent Solo balances:
-- 1) the daily account quota, reset at 02:00 local time;
-- 2) purchased Solo packs, which persist until consumed and never auto-renew.
-- Also keep purchasedRemaining accurate after same-day consumption.

create or replace function public.keep_battle_solo_daily_status(p_timezone text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_tz text := coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_usage_date date;
  v_next_reset timestamptz;
  v_plan text;
  v_daily_included integer := 0;
  v_bought integer := 0;
  v_first date;
  v_prior_bonus_used integer := 0;
  v_purchased_before_today integer := 0;
  v_purchased_remaining integer := 0;
  v_limit integer := 0;
  v_used integer := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_usage_date := ((now() at time zone v_tz) - interval '2 hours')::date;
  v_next_reset := ((v_usage_date + 1)::timestamp + interval '2 hours') at time zone v_tz;
  v_plan := public.keep_active_plan_code(uid);
  v_daily_included := public.keep_battle_solo_plan_limit(uid);

  select coalesce(sum(solos),0)::integer,
         min((created_at at time zone v_tz - interval '2 hours')::date)
    into v_bought, v_first
  from public.keep_battle_solo_pack_purchases
  where profile_id=uid;

  if v_bought > 0 and v_first is not null then
    select coalesce(sum(greatest(0, u.starts - v_daily_included)),0)::integer
      into v_prior_bonus_used
    from public.keep_battle_solo_daily_usage u
    where u.profile_id=uid
      and u.usage_date >= v_first
      and u.usage_date < v_usage_date;
  end if;

  v_purchased_before_today := greatest(0, v_bought - v_prior_bonus_used);
  v_limit := v_daily_included + v_purchased_before_today;

  select coalesce(starts,0) into v_used
  from public.keep_battle_solo_daily_usage
  where profile_id=uid and usage_date=v_usage_date;
  v_used := coalesce(v_used,0);

  v_purchased_remaining := greatest(
    0,
    v_purchased_before_today - greatest(0, v_used - v_daily_included)
  );

  return jsonb_build_object(
    'plan',v_plan,
    'used',v_used,
    'limit',v_limit,
    'remaining',greatest(0,v_limit-v_used),
    'dailyIncluded',v_daily_included,
    'purchasedRemaining',v_purchased_remaining,
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
  v_plan text;
  v_daily_included integer := 0;
  v_bought integer := 0;
  v_first date;
  v_prior_bonus_used integer := 0;
  v_purchased_before_today integer := 0;
  v_purchased_remaining integer := 0;
  v_limit integer := 0;
  v_starts integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_token)<8 or char_length(v_token)>160 then
    raise exception 'BATTLE_SOLO_SESSION_TOKEN_INVALID';
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;

  v_usage_date := ((now() at time zone v_tz) - interval '2 hours')::date;
  v_next_reset := ((v_usage_date + 1)::timestamp + interval '2 hours') at time zone v_tz;
  v_plan := public.keep_active_plan_code(uid);
  v_daily_included := public.keep_battle_solo_plan_limit(uid);

  select coalesce(sum(solos),0)::integer,
         min((created_at at time zone v_tz - interval '2 hours')::date)
    into v_bought, v_first
  from public.keep_battle_solo_pack_purchases
  where profile_id=uid;

  if v_bought > 0 and v_first is not null then
    select coalesce(sum(greatest(0, u.starts - v_daily_included)),0)::integer
      into v_prior_bonus_used
    from public.keep_battle_solo_daily_usage u
    where u.profile_id=uid
      and u.usage_date >= v_first
      and u.usage_date < v_usage_date;
  end if;

  v_purchased_before_today := greatest(0, v_bought - v_prior_bonus_used);
  v_limit := v_daily_included + v_purchased_before_today;

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

  if v_starts is null then raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%',v_limit; end if;

  v_purchased_remaining := greatest(
    0,
    v_purchased_before_today - greatest(0, v_starts - v_daily_included)
  );

  return jsonb_build_object(
    'used',v_starts,
    'limit',v_limit,
    'remaining',greatest(0,v_limit-v_starts),
    'dailyIncluded',v_daily_included,
    'purchasedRemaining',v_purchased_remaining,
    'unlimited',false,
    'plan',v_plan,
    'period','TODAY_2AM',
    'timezone',v_tz,
    'resetsAt',v_next_reset
  );
end;
$function$;

create or replace function public.keep_battle_solo_packs()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  s record;
  l record;
  v_bonus_before_today integer := 0;
  v_bonus_remaining integer := 0;
  v_plan_limit integer := 0;
  v_used_today integer := 0;
  v_today date;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into s from public.keep_battle_solo_pack_price('SMALL');
  select * into l from public.keep_battle_solo_pack_price('LARGE');

  v_plan_limit := public.keep_battle_solo_plan_limit(uid);
  v_bonus_before_today := public.keep_battle_solo_bonus_remaining(uid);
  v_today := public.keep_battle_solo_today();

  select coalesce(starts,0) into v_used_today
  from public.keep_battle_solo_daily_usage
  where profile_id=uid and usage_date=v_today;
  v_used_today := coalesce(v_used_today,0);

  v_bonus_remaining := greatest(
    0,
    v_bonus_before_today - greatest(0, v_used_today - v_plan_limit)
  );

  return jsonb_build_object(
    'packs', jsonb_build_array(
      jsonb_build_object('code','SMALL','solos',s.solos,'free',s.free),
      jsonb_build_object('code','LARGE','solos',l.solos,'free',l.free)
    ),
    'bonusRemaining', v_bonus_remaining,
    'balance', public.keep_theoretical_free_credit_remaining_for_profile(uid)
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
    '🎯 Pack Solo crédité',
    format('+%s Solos crédités immédiatement (-%s Free). Chaque Solo acheté reste disponible jusqu’à utilisation. Un pack épuisé doit être racheté.', v.solos, v.free),
    jsonb_build_object('pack', upper(p_code), 'solos', v.solos, 'creditDelta', -v.free)
  );

  return jsonb_build_object(
    'solosAdded', v.solos,
    'freeSpent', v.free,
    'balance', public.keep_theoretical_free_credit_remaining_for_profile(uid)
  );
end;
$function$;
