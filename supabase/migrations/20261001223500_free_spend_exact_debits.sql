-- FREE spend must represent only real debit operations, never technical ledger reconciliation.
drop trigger if exists trg_keep_log_download_credit_spend on public.download_credit_usage;
drop function if exists public.keep_log_download_credit_spend();

create or replace function public.keep_consume_download_credit()
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
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
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  cost := greatest(1, coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1), 1));
  select * into st from public.keep_download_credit_status();

  daily_cap := public.keep_plan_limit(st.plan_code,'downloads_per_day');
  select used_count into daily_used from public.feature_usage_counters
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

  if st.plan_code = 'FREE' then
    monthly_cap := public.keep_plan_limit('FREE','keeps_per_month');
    if monthly_cap is not null then
      insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
      values(uid,'KEEP_MONTHLY',month_key,0,now())
      on conflict(profile_id,feature_key,period_key) do nothing;

      select used_count into monthly_used from public.feature_usage_counters
      where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key
      for update;
      monthly_used := coalesce(monthly_used,0);

      if monthly_used >= monthly_cap then
        allowed := false;
        plan_code := st.plan_code;
        consumed := st.consumed;
        credit_limit := st.credit_limit;
        remaining := st.remaining;
        unlimited := false;
        return next;
        return;
      end if;
    end if;
  end if;

  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, 0, now())
  on conflict(profile_id) do nothing;

  select d.consumed_count into used
  from public.download_credit_usage d
  where d.profile_id = uid
  for update;

  select * into st from public.keep_download_credit_status();
  used := greatest(used,st.consumed);
  if coalesce(st.remaining,0) < cost or used + cost > coalesce(st.credit_limit,0) then
    allowed := false;
    plan_code := st.plan_code;
    consumed := used;
    credit_limit := st.credit_limit;
    remaining := greatest(0,coalesce(st.remaining,0));
    unlimited := false;
    return next;
    return;
  end if;

  used := used + cost;
  update public.download_credit_usage
  set consumed_count=used,updated_at=now()
  where profile_id=uid;

  -- Only this successful debit path writes the daily spend ledger.
  insert into public.keep_free_spend_events(profile_id,amount,reason,created_at)
  values(uid,cost,'KEEP_PROFILE',now());

  if st.plan_code = 'FREE' and monthly_cap is not null then
    update public.feature_usage_counters
    set used_count=monthly_used+1,updated_at=now()
    where profile_id=uid and feature_key='KEEP_MONTHLY' and period_key=month_key;
  end if;

  insert into public.feature_usage_counters(profile_id,feature_key,period_key,used_count,updated_at)
  values(uid,'KEEP_DAILY',day_key,1,now())
  on conflict(profile_id,feature_key,period_key) do update
    set used_count=public.feature_usage_counters.used_count+1,updated_at=now();

  allowed := true;
  plan_code := st.plan_code;
  consumed := used;
  credit_limit := st.credit_limit;
  remaining := greatest(0,st.credit_limit-used);
  unlimited := false;
  return next;
end;
$function$;
