-- KEEP — garde-fou produit : 3 crédits d'essai + 4 après création du compte = 7 au total.
-- Cette migration ne supprime ni KEEP, ni playlist, ni profil, ni historique utilisateur.
-- Elle corrige uniquement la configuration de quota qui avait été remise à +20.

update public.remote_config
set value = '4'::jsonb,
    description = '4 crédits supplémentaires débloqués après création du compte KEEP. Total gratuit = 3 crédits invité + 4 crédits compte = 7.',
    updated_at = now()
where key = 'signup_bonus_successes';

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 4;
  ledger_used integer := 0;
  derived_used integer := 0;
  used integer := 0;
  anon boolean := false;
  active_plan text := 'FREE';
begin
  if uid is null then raise exception 'authentication_required'; end if;

  guest_limit := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key='guest_success_limit'
    limit 1
  ), 3);

  signup_bonus := coalesce((
    select (rc.value #>> '{}')::integer
    from public.remote_config rc
    where rc.key='signup_bonus_successes'
    limit 1
  ), 4);

  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid), false);
  ledger_used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid), 0);

  if anon then
    used := ledger_used;
  else
    derived_used := public.keep_chargeable_keep_count(uid);
    used := greatest(ledger_used, derived_used);
    if used > ledger_used then
      insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
      values(uid, used, now())
      on conflict(profile_id) do update
      set consumed_count = greatest(public.download_credit_usage.consumed_count, excluded.consumed_count),
          updated_at = now();
    end if;
  end if;

  active_plan := coalesce((
    select p.code::text
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
    where s.profile_id=uid
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end>now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ), 'FREE');

  plan_code := active_plan;
  is_anonymous := anon;
  consumed := used;
  unlimited := active_plan <> 'FREE';
  credit_limit := case when unlimited then null when anon then guest_limit else guest_limit + signup_bonus end;
  remaining := case when unlimited then null else greatest(0, credit_limit - used) end;
  return next;
end;
$function$;

create or replace function public.admin_get_quota_settings()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  guest_limit integer := 3;
  signup_bonus integer := 4;
  limits jsonb := '[]'::jsonb;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;

  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1), 4);

  select coalesce(jsonb_agg(jsonb_build_object(
    'planCode', p.code::text,
    'limitKey', ul.limit_key,
    'limitValue', ul.limit_value
  ) order by p.code::text, ul.limit_key), '[]'::jsonb)
  into limits
  from public.usage_limits ul
  join public.plans p on p.id = ul.plan_id;

  return jsonb_build_object(
    'guestLimit', guest_limit,
    'signupBonus', signup_bonus,
    'freeTotal', guest_limit + signup_bonus,
    'usageLimits', limits
  );
end;
$function$;

revoke all on function public.keep_download_credit_status() from public;
revoke all on function public.admin_get_quota_settings() from public;
grant execute on function public.keep_download_credit_status() to authenticated;
grant execute on function public.admin_get_quota_settings() to authenticated;
