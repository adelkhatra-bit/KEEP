-- Loki Music: quotas d'identifications administrables par formule et période.
-- Compatible avec les anciens compteurs LISTEN_DAILY et les clés de déduplication.
-- Valeurs initiales: quotas existants, recharge quotidienne inchangée;
-- le Super Admin peut ensuite choisir DAY/WEEK/MONTH/NEVER et le quota.
insert into public.remote_config(key,value,description)
select 'listen_quota_period_' || p.plan_code, to_jsonb('DAY'::text),
  'Période de rechargement des identifications incluses : DAY, WEEK, MONTH, NEVER.'
from (values ('FREE'),('PREMIUM'),('CREATOR_PRO'),('VENUE_PRO')) p(plan_code)
on conflict (key) do nothing;

insert into public.remote_config(key,value,description)
select 'listen_quota_limit_' || p.plan_code,
  to_jsonb(greatest(1,coalesce(public.keep_plan_limit(p.plan_code,'listens_per_day'),p.fallback_limit))),
  'Identifications incluses par période pour cette formule ; les suivantes demandent des FREE.'
from (values ('FREE',5),('PREMIUM',30),('CREATOR_PRO',60),('VENUE_PRO',150)) p(plan_code,fallback_limit)
on conflict (key) do nothing;

create or replace function public.service_listen_status_for_profile(
  p_profile_id uuid, p_timezone text default 'Europe/Paris'
) returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $fn$
declare
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Paris');
  v_anon boolean:=false;
  v_plan text:='FREE';
  v_mode text:='DAY';
  v_period_key text;
  v_next_reset timestamptz:=null;
  v_used integer:=0;
  v_limit integer:=0;
  v_cost integer:=1;
  v_balance integer:=0;
  v_over boolean:=false;
  v_now timestamp;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id) then
    return jsonb_build_object('ok',false,'reason','PROFILE_REQUIRED');
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_tz) then v_tz:='Europe/Paris'; end if;
  v_now:=now() at time zone v_tz;
  v_anon:=coalesce((select u.is_anonymous from auth.users u where u.id=p_profile_id),false);
  v_plan:=public.keep_active_plan_code(p_profile_id);
  if v_plan not in ('FREE','PREMIUM','CREATOR_PRO','VENUE_PRO') then v_plan:='FREE'; end if;
  if v_anon then
    v_mode:='NEVER';
    v_period_key:='LIFETIME';
    v_limit:=greatest(1,coalesce(
      (select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),3
    ));
  else
    v_mode:=upper(coalesce(
      (select value #>> '{}' from public.remote_config where key='listen_quota_period_'||v_plan limit 1),
      'DAY'
    ));
    if v_mode not in ('DAY','WEEK','MONTH','NEVER') then v_mode:='DAY'; end if;
    v_period_key:=case v_mode
      when 'WEEK' then 'W:'||to_char(date_trunc('week',v_now),'YYYY-MM-DD')
      when 'MONTH' then 'M:'||to_char(date_trunc('month',v_now),'YYYY-MM')
      when 'NEVER' then 'LIFETIME'
      else v_now::date::text end;
    v_next_reset:=case v_mode
      when 'DAY' then (date_trunc('day',v_now)+interval '1 day') at time zone v_tz
      when 'WEEK' then (date_trunc('week',v_now)+interval '1 week') at time zone v_tz
      when 'MONTH' then (date_trunc('month',v_now)+interval '1 month') at time zone v_tz
      else null end;
    v_limit:=greatest(1,coalesce(
      (select (value #>> '{}')::integer from public.remote_config where key='listen_quota_limit_'||v_plan limit 1),
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
    'ok',true,'planCode',v_plan,'isAnonymous',v_anon,'featureKey','LISTEN_DAILY',
    'periodKey',v_period_key,'periodMode',v_mode,'nextResetAt',v_next_reset,
    'used',v_used,'limit',v_limit,'includedRemaining',greatest(0,v_limit-v_used),
    'overQuota',v_over,'overQuotaFreeCost',v_cost,'freeBalance',v_balance,
    'canListen',not v_over,'canPayWithFree',(not v_anon and v_balance>=v_cost),
    'timezone',v_tz
  );
end;
$fn$;

comment on function public.service_listen_status_for_profile(uuid,text)
is 'Quota Écouter piloté par Super Admin: DAY/WEEK/MONTH/NEVER et limites par formule. FREE uniquement sur reconnaissance réussie hors quota.';
