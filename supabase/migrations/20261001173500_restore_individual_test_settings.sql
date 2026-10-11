-- Restore explicit per-user Super Admin test controls.
-- Product/code fixes remain global; test overrides remain individual by profile.

-- Central test-mode fields remain for backward-compatible schema history but are disabled.
update public.profiles set test_mode_enabled=false where coalesce(test_mode_enabled,false)=true;
update public.feature_flags set test_bypass_allowed=false where coalesce(test_bypass_allowed,false)=true;

create or replace function public.keep_feature_flag_enabled_for_me(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_global boolean := false;
  v_rollout integer := 0;
  v_bypass boolean := false;
begin
  select is_enabled_globally, rollout_percent
  into v_global, v_rollout
  from public.feature_flags
  where key=p_key;

  if v_global is true and coalesce(v_rollout,0)>0 then
    return true;
  end if;

  if uid is not null then
    select exists(
      select 1
      from public.feature_flag_test_accounts
      where profile_id=uid and flag_key=p_key
    ) into v_bypass;
  end if;

  return coalesce(v_bypass,false);
end;
$function$;

grant execute on function public.keep_feature_flag_enabled_for_me(text) to authenticated,anon;

create or replace function public.admin_set_follower_count_override(p_profile_id uuid,p_override integer)
returns void
language plpgsql
security definer
set search_path to 'public'
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
  set follower_count_override=p_override
  where id=p_profile_id;

  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,after)
  values(
    v_uid,
    'user.follower_override.set',
    'profile',
    p_profile_id::text,
    jsonb_build_object('override',p_override)
  );
end;
$function$;

revoke all on function public.admin_set_follower_count_override(uuid,integer) from public;
grant execute on function public.admin_set_follower_count_override(uuid,integer) to authenticated;

drop function if exists public.admin_set_profile_test_mode(uuid,boolean);

-- Inside was explicitly requested as a test account in this session.
-- Keep this as an individual per-profile setting, not an inherited/global rule.
insert into public.feature_flag_test_accounts(profile_id,flag_key)
select id,'playlist_marketplace'
from public.profiles
where lower(username)=lower('inside')
on conflict(profile_id,flag_key) do nothing;
