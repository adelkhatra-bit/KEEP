-- Économie FREE — Super Admin aligné sur les clés canoniques.
-- IMPORTANT : guest_success_limit / signup_bonus_successes restent intacts.
-- Ils constituent l'historique utilisé pour grandfather les comptes antérieurs au 04/10/2026.

create or replace function public.admin_get_quota_settings()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  guest_limit integer := 3;
  signup_bonus integer := 5;
  limits jsonb := '[]'::jsonb;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;

  guest_limit := coalesce(
    (select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),
    3
  );
  signup_bonus := coalesce(
    (select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_recognitions' limit 1),
    5
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'planCode', p.code::text,
        'limitKey', ul.limit_key,
        'limitValue', ul.limit_value
      )
      order by p.code::text, ul.limit_key
    ),
    '[]'::jsonb
  )
  into limits
  from public.usage_limits ul
  join public.plans p on p.id = ul.plan_id;

  return jsonb_build_object(
    'guestLimit', guest_limit,
    'signupBonus', signup_bonus,
    'usageLimits', limits
  );
end;
$function$;

create or replace function public.admin_set_free_credit_rules(
  p_guest_limit integer,
  p_signup_bonus integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  before_state jsonb;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;
  if p_guest_limit is null or p_guest_limit < 0 or p_guest_limit > 100000 then
    raise exception 'invalid_guest_limit';
  end if;
  if p_signup_bonus is null or p_signup_bonus < 0 or p_signup_bonus > 100000 then
    raise exception 'invalid_signup_bonus';
  end if;

  before_state := jsonb_build_object(
    'guestLimit', coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_recognition_limit' limit 1),3),
    'signupBonus', coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_recognitions' limit 1),5)
  );

  insert into public.remote_config(key,value,description,updated_at)
  values(
    'guest_recognition_limit',
    to_jsonb(p_guest_limit),
    'Reconnaissances réussies totales autorisées à un invité avant création/connexion du compte.',
    now()
  )
  on conflict(key) do update
  set value=excluded.value,description=excluded.description,updated_at=now();

  insert into public.remote_config(key,value,description,updated_at)
  values(
    'signup_bonus_recognitions',
    to_jsonb(p_signup_bonus),
    'FREE crédités aux nouveaux comptes selon l’économie FREE active. Les comptes historiques gardent leur ancien bonus.',
    now()
  )
  on conflict(key) do update
  set value=excluded.value,description=excluded.description,updated_at=now();

  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,before,after)
  values(
    uid,
    'quota.free.updated',
    'remote_config',
    null,
    before_state,
    jsonb_build_object('guestLimit',p_guest_limit,'signupBonus',p_signup_bonus)
  );

  return jsonb_build_object('ok',true,'guestLimit',p_guest_limit,'signupBonus',p_signup_bonus);
end;
$function$;

create or replace function public.admin_set_usage_limit(
  p_plan_code text,
  p_limit_key text,
  p_limit_value integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  target_plan_id uuid;
  normalized_code text := upper(trim(coalesce(p_plan_code,'')));
  normalized_key text := trim(coalesce(p_limit_key,''));
  before_value integer;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;

  if normalized_key not in (
    'keeps_per_month','follows_max','compares_per_month','providers_max','events_max',
    'discovery_profiles_lifetime','smart_sort_trials_lifetime','events_per_month',
    'downloads_per_day','listens_per_day','battle_matches_per_month','battle_matches_per_day'
  ) then
    raise exception 'invalid_limit_key';
  end if;
  if p_limit_value is not null and (p_limit_value < 0 or p_limit_value > 1000000) then
    raise exception 'invalid_limit_value';
  end if;

  select id into target_plan_id from public.plans where code::text = normalized_code limit 1;
  if target_plan_id is null then raise exception 'plan_not_found'; end if;

  select limit_value into before_value
  from public.usage_limits
  where plan_id=target_plan_id and limit_key=normalized_key;

  insert into public.usage_limits(plan_id,limit_key,limit_value)
  values(target_plan_id,normalized_key,p_limit_value)
  on conflict(plan_id,limit_key) do update set limit_value=excluded.limit_value;

  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,before,after)
  values(
    uid,
    'quota.plan.updated',
    'plan',
    target_plan_id,
    jsonb_build_object('planCode',normalized_code,'limitKey',normalized_key,'limitValue',before_value),
    jsonb_build_object('planCode',normalized_code,'limitKey',normalized_key,'limitValue',p_limit_value)
  );

  return jsonb_build_object('ok',true,'planCode',normalized_code,'limitKey',normalized_key,'limitValue',p_limit_value);
end;
$function$;

revoke all on function public.admin_get_quota_settings() from public,anon;
revoke all on function public.admin_set_free_credit_rules(integer,integer) from public,anon;
revoke all on function public.admin_set_usage_limit(text,text,integer) from public,anon;
grant execute on function public.admin_get_quota_settings() to authenticated;
grant execute on function public.admin_set_free_credit_rules(integer,integer) to authenticated;
grant execute on function public.admin_set_usage_limit(text,text,integer) to authenticated;
