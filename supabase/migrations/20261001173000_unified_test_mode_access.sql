-- Unified test mode: one server-side rule for every test account.
-- A profile marked as test gets all feature flags explicitly allowed for test,
-- without one-off per-user bypass rows. Production remains unchanged.

alter table public.profiles
  add column if not exists test_mode_enabled boolean not null default false;

alter table public.feature_flags
  add column if not exists test_bypass_allowed boolean not null default false;

-- Marketplace can be tested by internal/test profiles while remaining globally
-- disabled for production/native Store compliance.
update public.feature_flags
set test_bypass_allowed=true
where key='playlist_marketplace';

-- Existing test markers migrate automatically to the central mode.
update public.profiles p
set test_mode_enabled=true
where p.follower_count_override is not null
   or exists(
     select 1 from public.feature_flag_test_accounts f
     where f.profile_id=p.id
   );

create or replace function public.keep_test_mode_enabled_for_me()
returns boolean
language sql
stable
security definer
set search_path=public,auth
as $function$
  select coalesce(
    (select p.test_mode_enabled from public.profiles p where p.id=auth.uid()),
    false
  );
$function$;

revoke all on function public.keep_test_mode_enabled_for_me() from public;
grant execute on function public.keep_test_mode_enabled_for_me() to authenticated;

create or replace function public.keep_feature_flag_enabled_for_me(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_global boolean := false;
  v_rollout integer := 0;
  v_test_bypass_allowed boolean := false;
  v_test_mode boolean := false;
  v_legacy_bypass boolean := false;
begin
  select
    coalesce(ff.is_enabled_globally,false),
    coalesce(ff.rollout_percent,0),
    coalesce(ff.test_bypass_allowed,false)
  into v_global,v_rollout,v_test_bypass_allowed
  from public.feature_flags ff
  where ff.key=p_key;

  if v_global is true and v_rollout > 0 then
    return true;
  end if;

  if uid is null then
    return false;
  end if;

  select coalesce(p.test_mode_enabled,false)
  into v_test_mode
  from public.profiles p
  where p.id=uid;

  if v_test_mode and v_test_bypass_allowed then
    return true;
  end if;

  -- Backward-compatible only: old explicit rows still work while callers
  -- migrate to central test mode. No new per-user row is required.
  select exists(
    select 1
    from public.feature_flag_test_accounts f
    where f.profile_id=uid and f.flag_key=p_key
  ) into v_legacy_bypass;

  return coalesce(v_legacy_bypass,false);
end;
$function$;

grant execute on function public.keep_feature_flag_enabled_for_me(text) to authenticated,anon;

create or replace function public.admin_set_profile_test_mode(p_profile_id uuid,p_enabled boolean)
returns void
language plpgsql
security definer
set search_path=public,auth
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(
    select 1 from public.admin_users a
    where a.id=v_uid and a.is_active=true
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  update public.profiles
  set test_mode_enabled=coalesce(p_enabled,false)
  where id=p_profile_id;

  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,after)
  values(
    v_uid,
    'user.test_mode.set',
    'profile',
    p_profile_id::text,
    jsonb_build_object('enabled',coalesce(p_enabled,false))
  );
end;
$function$;

revoke all on function public.admin_set_profile_test_mode(uuid,boolean) from public;
grant execute on function public.admin_set_profile_test_mode(uuid,boolean) to authenticated;

-- Setting a follower override is an explicit test action, so it automatically
-- enters/leaves central test mode. This prevents the old "1000 followers but
-- still blocked elsewhere" split-brain state.
create or replace function public.admin_set_follower_count_override(p_profile_id uuid,p_override integer)
returns void
language plpgsql
security definer
set search_path=public,auth
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists(
    select 1 from public.admin_users a
    where a.id=v_uid and a.is_active=true
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  update public.profiles
  set follower_count_override=p_override,
      test_mode_enabled=(p_override is not null)
  where id=p_profile_id;

  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,after)
  values(
    v_uid,
    'user.follower_override.set',
    'profile',
    p_profile_id::text,
    jsonb_build_object(
      'override',p_override,
      'testModeEnabled',(p_override is not null)
    )
  );
end;
$function$;

revoke all on function public.admin_set_follower_count_override(uuid,integer) from public;
grant execute on function public.admin_set_follower_count_override(uuid,integer) to authenticated;
