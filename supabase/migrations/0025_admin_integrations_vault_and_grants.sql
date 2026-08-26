alter table public.integration_secrets
  add column if not exists vault_secret_id uuid;

create or replace function public.service_set_integration_secret(
  p_key text,
  p_category text,
  p_value text,
  p_hint text,
  p_updated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := 'keep_' || lower(p_key);
begin
  if p_key is null or btrim(p_key) = '' or p_value is null or btrim(p_value) = '' then
    raise exception 'key_and_value_required';
  end if;

  select vault_secret_id into v_id
  from public.integration_secrets
  where key = p_key
  for update;

  if v_id is null then
    select id into v_id from vault.secrets where name = v_name limit 1;
  end if;

  if v_id is null then
    v_id := vault.create_secret(p_value, v_name, 'KEEP integration ' || p_key);
  else
    perform vault.update_secret(v_id, p_value, v_name, 'KEEP integration ' || p_key);
  end if;

  insert into public.integration_secrets(key, category, encrypted_value, vault_secret_id, value_hint, is_configured, updated_by, updated_at)
  values (p_key, p_category, 'vault', v_id, p_hint, true, p_updated_by, now())
  on conflict (key) do update set
    category = excluded.category,
    encrypted_value = 'vault',
    vault_secret_id = excluded.vault_secret_id,
    value_hint = excluded.value_hint,
    is_configured = true,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

-- PL/pgSQL + SQL dynamique : Supabase possède `vault.decrypted_secrets`, mais
-- le CI migrations tourne sur PostgreSQL pur. On peut donc créer la migration
-- dans les deux environnements sans faux échec, tout en utilisant Vault en prod.
create or replace function public.service_get_integration_secret(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;

  execute $sql$
    select v.decrypted_secret
    from public.integration_secrets i
    join vault.decrypted_secrets v on v.id = i.vault_secret_id
    where i.key = $1 and i.is_configured = true
    limit 1
  $sql$ into v_value using p_key;

  return v_value;
end;
$$;

create or replace function public.service_delete_integration_secret(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select vault_secret_id into v_id from public.integration_secrets where key = p_key;
  delete from public.integration_secrets where key = p_key;
  if v_id is not null and to_regclass('vault.secrets') is not null then
    execute 'delete from vault.secrets where id = $1' using v_id;
  end if;
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
begin
  if p_months < 1 or p_months > 60 then
    raise exception 'invalid_grant_duration';
  end if;

  if not exists (select 1 from public.admin_users a where a.id = p_granted_by and a.is_active = true) then
    raise exception 'admin_required';
  end if;

  select * into v_plan
  from public.plans
  where code::text = upper(p_plan_code) and is_active = true
  limit 1;
  if v_plan.id is null then raise exception 'plan_not_found'; end if;

  select * into v_price
  from public.plan_prices
  where plan_id = v_plan.id and is_active = true and period::text = 'MONTHLY'
  order by effective_from desc
  limit 1;
  if v_price.id is null then raise exception 'active_monthly_price_not_found'; end if;

  select coalesce(nullif(country_code::text, ''), 'FR')::char(2) into v_country
  from public.profiles where id = p_profile_id;
  if v_country is null then raise exception 'profile_not_found'; end if;

  update public.subscriptions
  set status = 'EXPIRED'::public.subscription_status,
      current_period_end = least(coalesce(current_period_end, now()), now()),
      updated_at = now()
  where profile_id = p_profile_id
    and source = 'admin_grant'
    and status in ('ACTIVE'::public.subscription_status, 'TRIALING'::public.subscription_status);

  insert into public.subscriptions(
    profile_id, plan_id, plan_price_id, channel, status,
    country_code, currency_code, current_period_start, current_period_end,
    cancel_at_period_end, source, granted_by, grant_reason
  ) values (
    p_profile_id, v_plan.id, v_price.id, 'WEB'::public.payment_channel, 'ACTIVE'::public.subscription_status,
    v_country, v_price.currency_code, now(), now() + make_interval(months => p_months),
    true, 'admin_grant', p_granted_by, nullif(btrim(coalesce(p_reason, '')), '')
  ) returning * into v_subscription;

  return jsonb_build_object(
    'subscriptionId', v_subscription.id,
    'profileId', p_profile_id,
    'planCode', v_plan.code::text,
    'months', p_months,
    'endsAt', v_subscription.current_period_end
  );
end;
$$;

create or replace function public.service_revoke_admin_grant(
  p_profile_id uuid,
  p_granted_by uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.admin_users a where a.id = p_granted_by and a.is_active = true) then
    raise exception 'admin_required';
  end if;

  update public.subscriptions
  set status = 'CANCELLED'::public.subscription_status,
      current_period_end = now(),
      cancel_at_period_end = true,
      updated_at = now()
  where profile_id = p_profile_id
    and source = 'admin_grant'
    and status in ('ACTIVE'::public.subscription_status, 'TRIALING'::public.subscription_status);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_user_directory()
returns table(
  id uuid,
  email text,
  username text,
  display_name text,
  country_code character,
  kind text,
  created_at timestamptz,
  plan_code text,
  keeps_this_month bigint
)
language plpgsql
security definer
set search_path = 'public', 'auth'
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.username::text,
    p.display_name::text,
    p.country_code,
    p.kind::text,
    p.created_at,
    coalesce(active_plan.code, 'FREE')::text as plan_code,
    coalesce(k.keeps, 0)::bigint as keeps_this_month
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join lateral (
    select pl.code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status::text in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.updated_at desc nulls last, s.created_at desc
    limit 1
  ) active_plan on true
  left join lateral (
    select count(*)::bigint as keeps
    from public.keep_decisions kd
    where kd.profile_id = p.id
      and kd.decision = 'KEPT'
      and kd.created_at >= date_trunc('month', now())
  ) k on true
  order by p.created_at desc;
end;
$$;

revoke all on function public.service_set_integration_secret(text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.service_get_integration_secret(text) from public, anon, authenticated;
revoke all on function public.service_delete_integration_secret(text) from public, anon, authenticated;
revoke all on function public.service_grant_plan(uuid,text,integer,uuid,text) from public, anon, authenticated;
revoke all on function public.service_revoke_admin_grant(uuid,uuid) from public, anon, authenticated;
grant execute on function public.service_set_integration_secret(text,text,text,text,uuid) to service_role;
grant execute on function public.service_get_integration_secret(text) to service_role;
grant execute on function public.service_delete_integration_secret(text) to service_role;
grant execute on function public.service_grant_plan(uuid,text,integer,uuid,text) to service_role;
grant execute on function public.service_revoke_admin_grant(uuid,uuid) to service_role;
