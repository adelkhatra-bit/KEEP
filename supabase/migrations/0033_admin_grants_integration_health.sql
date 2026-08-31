-- KEEP — santé des intégrations payantes + cadeaux Super Admin.
-- Objectifs :
-- 1) remonter dans le Super Admin si AudD est actif/épuisé/en erreur ;
-- 2) permettre les cadeaux de formule à durée fixe ou sans date de fin ;
-- 3) corriger le trigger devise qui empêchait réellement l'attribution d'un plan.

create table if not exists public.integration_runtime_status (
  key text primary key,
  status text not null default 'UNKNOWN'
    check (status in ('UNKNOWN','ACTIVE','EXHAUSTED','ERROR','NOT_CONFIGURED')),
  last_checked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.integration_runtime_status enable row level security;
revoke all on public.integration_runtime_status from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    revoke all on public.integration_runtime_status from anon;
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    revoke all on public.integration_runtime_status from authenticated;
  end if;
end $$;

create or replace function public.check_subscription_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  price_currency char(3);
begin
  select pp.currency_code into price_currency
  from public.plan_prices pp
  where pp.id = new.plan_price_id;

  if price_currency is distinct from new.currency_code then
    raise exception 'subscriptions.currency_code (%) doit correspondre à plan_prices.currency_code (%)', new.currency_code, price_currency;
  end if;
  return new;
end;
$$;

create or replace function public.service_grant_plan(
  p_profile_id uuid,
  p_plan_code text,
  p_months integer,
  p_granted_by uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_price public.plan_prices%rowtype;
  v_country char(2);
  v_subscription public.subscriptions%rowtype;
  v_end timestamptz;
begin
  -- 0 = cadeau sans date de fin, révocable à tout moment par le Super Admin.
  -- 1..60 = durée fixe en mois.
  if p_months < 0 or p_months > 60 then
    raise exception 'invalid_grant_duration';
  end if;

  if not exists (
    select 1 from public.admin_users a
    where a.id = p_granted_by and a.is_active = true
  ) then
    raise exception 'admin_required';
  end if;

  select * into v_plan
  from public.plans
  where code::text = upper(p_plan_code) and is_active = true
  limit 1;
  if v_plan.id is null then raise exception 'plan_not_found'; end if;

  select * into v_price
  from public.plan_prices
  where plan_id = v_plan.id
    and is_active = true
    and period::text = 'MONTHLY'
  order by effective_from desc
  limit 1;
  if v_price.id is null then raise exception 'active_monthly_price_not_found'; end if;

  select coalesce(nullif(country_code::text, ''), 'FR')::char(2)
  into v_country
  from public.profiles
  where id = p_profile_id;
  if v_country is null then raise exception 'profile_not_found'; end if;

  update public.subscriptions
  set status = 'EXPIRED'::public.subscription_status,
      current_period_end = least(coalesce(current_period_end, now()), now()),
      updated_at = now()
  where profile_id = p_profile_id
    and source = 'admin_grant'
    and status in ('ACTIVE'::public.subscription_status, 'TRIALING'::public.subscription_status);

  v_end := case
    when p_months = 0 then null
    else now() + make_interval(months => p_months)
  end;

  insert into public.subscriptions(
    profile_id, plan_id, plan_price_id, channel, status,
    country_code, currency_code, current_period_start, current_period_end,
    cancel_at_period_end, source, granted_by, grant_reason
  ) values (
    p_profile_id, v_plan.id, v_price.id,
    'WEB'::public.payment_channel,
    'ACTIVE'::public.subscription_status,
    v_country, v_price.currency_code,
    now(), v_end,
    p_months <> 0,
    'admin_grant', p_granted_by,
    nullif(btrim(coalesce(p_reason, '')), '')
  ) returning * into v_subscription;

  return jsonb_build_object(
    'subscriptionId', v_subscription.id,
    'profileId', p_profile_id,
    'planCode', v_plan.code::text,
    'months', p_months,
    'unlimited', p_months = 0,
    'endsAt', v_subscription.current_period_end
  );
end;
$$;

create or replace function public.admin_integration_runtime_status()
returns table(key text, status text, last_checked_at timestamptz, last_error text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid()
      and a.is_active = true
      and a.role in ('SUPER_ADMIN','ADMIN')
  ) then
    raise exception 'admin_required';
  end if;

  return query
  select s.key, s.status, s.last_checked_at, s.last_error
  from public.integration_runtime_status s
  order by s.key;
end;
$$;

grant execute on function public.admin_integration_runtime_status() to authenticated;
