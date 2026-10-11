create or replace function public.keep_notify_admin_grant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  plan_label text;
  plan_code text;
  duration_label text;
  monthly_free integer := 0;
  solo_daily integer := null;
  providers_max integer := null;
  downloads_per_day integer := null;
  detail_parts text[] := array[]::text[];
begin
  if new.source <> 'admin_grant' or new.status::text not in ('ACTIVE','TRIALING') then
    return new;
  end if;

  select coalesce(name, code::text), code::text
    into plan_label, plan_code
  from public.plans
  where id = new.plan_id;

  select coalesce(free_bonus_per_month, 0)
    into monthly_free
  from public.plan_prices
  where id = new.plan_price_id;

  select nullif(value #>> '{}','')::integer
    into solo_daily
  from public.remote_config
  where key = 'battle_solo_daily_limit_' || lower(plan_code)
  limit 1;

  select limit_value into providers_max
  from public.usage_limits
  where plan_id = new.plan_id and limit_key = 'providers_max'
  limit 1;

  select limit_value into downloads_per_day
  from public.usage_limits
  where plan_id = new.plan_id and limit_key = 'downloads_per_day'
  limit 1;

  duration_label := case
    when new.current_period_end is null then 'sans limite de durée'
    else 'jusqu’au ' || to_char(new.current_period_end at time zone 'Europe/Paris','DD/MM/YYYY')
  end;

  if monthly_free > 0 then detail_parts := array_append(detail_parts, monthly_free || ' FREE/mois'); end if;
  if solo_daily is not null then detail_parts := array_append(detail_parts, solo_daily || ' Solos/jour'); end if;
  if providers_max is not null then detail_parts := array_append(detail_parts, providers_max || ' services musicaux'); end if;
  if downloads_per_day is not null then detail_parts := array_append(detail_parts, downloads_per_day || ' téléchargements/jour'); end if;

  insert into public.notifications(profile_id,type,title,body,data)
  values (
    new.profile_id,
    'PLAN_GIFTED',
    '🎁 ' || coalesce(plan_label,'Abonnement Loki Music') || ' offert',
    'Félicitations ! ' || coalesce(plan_label,'Un abonnement Loki Music') || ' t’est offert ' || duration_label ||
      case when cardinality(detail_parts) > 0 then ' · ' || array_to_string(detail_parts, ' · ') else '' end || '.',
    jsonb_build_object(
      'subscription_id', new.id,
      'plan_id', new.plan_id,
      'plan_code', plan_code,
      'plan_name', plan_label,
      'ends_at', new.current_period_end,
      'monthly_free', monthly_free,
      'solo_daily_limit', solo_daily,
      'providers_max', providers_max,
      'downloads_per_day', downloads_per_day,
      'source', 'admin_grant',
      'event', 'PLAN_GIFTED'
    )
  );
  return new;
end;
$function$;
