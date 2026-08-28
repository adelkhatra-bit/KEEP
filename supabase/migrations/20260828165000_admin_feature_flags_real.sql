-- KEEP — Super Admin Feature Flags réellement persistés et audités.

create or replace function public.admin_feature_flag_set(
  p_key text,
  p_enabled boolean
)
returns table(
  key text,
  description text,
  is_enabled_globally boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  before_row jsonb;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'not_admin';
  end if;

  select to_jsonb(f) into before_row
  from public.feature_flags f
  where f.key = p_key;

  if before_row is null then
    raise exception 'unknown_feature_flag';
  end if;

  update public.feature_flags f
  set is_enabled_globally = p_enabled,
      updated_at = now(),
      updated_by = uid
  where f.key = p_key;

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  select uid,
         'feature_flag.set',
         'feature_flag',
         p_key,
         before_row,
         to_jsonb(f)
  from public.feature_flags f
  where f.key = p_key;

  return query
  select f.key, f.description, f.is_enabled_globally, f.updated_at
  from public.feature_flags f
  where f.key = p_key;
end;
$$;

revoke all on function public.admin_feature_flag_set(text, boolean) from public;
revoke all on function public.admin_feature_flag_set(text, boolean) from anon;
revoke all on function public.admin_feature_flag_set(text, boolean) from authenticated;
grant execute on function public.admin_feature_flag_set(text, boolean) to authenticated;
