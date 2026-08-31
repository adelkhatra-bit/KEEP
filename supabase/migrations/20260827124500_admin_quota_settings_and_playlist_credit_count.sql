-- KEEP — compteur FREE fondé sur les morceaux réellement gardés et réglages quotas Super Admin.
-- Source de vérité d'un compte authentifié : morceaux uniques synchronisés dans playlist_tracks.
-- L'ancien ledger reste uniquement pour la compatibilité des anciens comptes anonymes.

create or replace function public.keep_download_credit_status()
returns table(plan_code text, is_anonymous boolean, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  guest_limit integer := 3;
  signup_bonus integer := 20;
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
  ), 20);

  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid), false);

  if anon then
    used := coalesce((select d.consumed_count from public.download_credit_usage d where d.profile_id=uid), 0);
  else
    select count(distinct pt.track_id)::integer
      into used
    from public.playlists p
    join public.playlist_tracks pt on pt.playlist_id = p.id
    where p.owner_id = uid
      and coalesce(pt.added_via, 'KEEP') = 'KEEP';
    used := coalesce(used, 0);
  end if;

  active_plan := coalesce((
    select p.code::text
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
    where s.profile_id=uid and s.status in ('ACTIVE','TRIALING')
    order by s.created_at desc
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

create or replace function public.keep_consume_download_credit()
returns table(allowed boolean, plan_code text, consumed integer, credit_limit integer, remaining integer, unlimited boolean)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  st record;
  new_used integer;
  anon boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into st from public.keep_download_credit_status();
  if not st.unlimited and st.remaining <= 0 then
    allowed := false; plan_code := st.plan_code; consumed := st.consumed; credit_limit := st.credit_limit; remaining := 0; unlimited := false; return next; return;
  end if;

  anon := coalesce((select u.is_anonymous from auth.users u where u.id=uid), false);

  -- Les invités historiques utilisent encore le ledger. Pour les vrais comptes,
  -- le compteur est recalculé depuis les morceaux réellement présents en playlist.
  if anon then
    insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
    values(uid,1,now())
    on conflict(profile_id) do update set consumed_count=public.download_credit_usage.consumed_count+1, updated_at=now()
    returning consumed_count into new_used;
  else
    new_used := st.consumed;
  end if;

  allowed := true;
  plan_code := st.plan_code;
  consumed := new_used;
  unlimited := st.unlimited;
  credit_limit := st.credit_limit;
  remaining := case when st.unlimited then null else greatest(0, st.credit_limit-new_used) end;
  return next;
end;
$function$;

revoke all on function public.keep_download_credit_status() from public;
revoke all on function public.keep_consume_download_credit() from public;
grant execute on function public.keep_download_credit_status() to authenticated;
grant execute on function public.keep_consume_download_credit() to authenticated;

-- Recalage du ledger historique pour qu'un audit Super Admin ne conserve pas
-- des valeurs obsolètes. La fonction de statut n'en dépend plus pour les comptes réels.
update public.download_credit_usage d
set consumed_count = src.kept_count,
    updated_at = now()
from (
  select p.id as profile_id, count(distinct pt.track_id)::integer as kept_count
  from public.profiles p
  left join public.playlists pl on pl.owner_id = p.id
  left join public.playlist_tracks pt on pt.playlist_id = pl.id and coalesce(pt.added_via, 'KEEP') = 'KEEP'
  left join auth.users u on u.id = p.id
  where coalesce(u.is_anonymous, false) = false
  group by p.id
) src
where d.profile_id = src.profile_id;

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
  signup_bonus integer := 20;
  limits jsonb := '[]'::jsonb;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;

  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1), 20);

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

create or replace function public.admin_set_free_credit_rules(p_guest_limit integer, p_signup_bonus integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;
  if p_guest_limit is null or p_guest_limit < 0 or p_guest_limit > 100000 then raise exception 'invalid_guest_limit'; end if;
  if p_signup_bonus is null or p_signup_bonus < 0 or p_signup_bonus > 100000 then raise exception 'invalid_signup_bonus'; end if;

  insert into public.remote_config(key,value,description,updated_at)
  values ('guest_success_limit', to_jsonb(p_guest_limit), 'Nombre de morceaux gardés offerts avant création du compte.', now())
  on conflict(key) do update set value=excluded.value, description=excluded.description, updated_at=now();

  insert into public.remote_config(key,value,description,updated_at)
  values ('signup_bonus_successes', to_jsonb(p_signup_bonus), 'Crédits supplémentaires débloqués après création du compte KEEP.', now())
  on conflict(key) do update set value=excluded.value, description=excluded.description, updated_at=now();

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  values (uid, 'quota.free.updated', 'remote_config', null, null,
    jsonb_build_object('guestLimit',p_guest_limit,'signupBonus',p_signup_bonus,'freeTotal',p_guest_limit+p_signup_bonus));

  return jsonb_build_object('ok',true,'guestLimit',p_guest_limit,'signupBonus',p_signup_bonus,'freeTotal',p_guest_limit+p_signup_bonus);
end;
$function$;

create or replace function public.admin_set_usage_limit(p_plan_code text, p_limit_key text, p_limit_value integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  actor_role text;
  target_plan_id uuid;
  normalized_code text := upper(trim(coalesce(p_plan_code,'')));
  normalized_key text := trim(coalesce(p_limit_key,''));
begin
  select au.role::text into actor_role
  from public.admin_users au
  where au.id = uid and au.is_active = true;

  if actor_role is null or actor_role not in ('SUPER_ADMIN','ADMIN','FINANCE') then
    raise exception 'admin_required';
  end if;
  if normalized_key not in ('keeps_per_month','follows_max','compares_per_month','providers_max','events_max') then
    raise exception 'invalid_limit_key';
  end if;
  if p_limit_value is not null and (p_limit_value < 0 or p_limit_value > 1000000) then
    raise exception 'invalid_limit_value';
  end if;

  select id into target_plan_id from public.plans where code::text = normalized_code limit 1;
  if target_plan_id is null then raise exception 'plan_not_found'; end if;

  insert into public.usage_limits(plan_id, limit_key, limit_value)
  values(target_plan_id, normalized_key, p_limit_value)
  on conflict(plan_id, limit_key) do update set limit_value=excluded.limit_value;

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  values (uid, 'quota.plan.updated', 'plan', target_plan_id, null,
    jsonb_build_object('planCode',normalized_code,'limitKey',normalized_key,'limitValue',p_limit_value));

  return jsonb_build_object('ok',true,'planCode',normalized_code,'limitKey',normalized_key,'limitValue',p_limit_value);
end;
$function$;

revoke all on function public.admin_get_quota_settings() from public;
revoke all on function public.admin_set_free_credit_rules(integer, integer) from public;
revoke all on function public.admin_set_usage_limit(text, text, integer) from public;
grant execute on function public.admin_get_quota_settings() to authenticated;
grant execute on function public.admin_set_free_credit_rules(integer, integer) to authenticated;
grant execute on function public.admin_set_usage_limit(text, text, integer) to authenticated;
