-- KEEP — Super Admin remote_config accessible depuis le site statique.
-- Aucune clé service-role dans le navigateur : auth.uid() doit être un admin actif.

create or replace function public.admin_remote_config_list()
returns table(key text, value jsonb, description text, updated_at timestamptz)
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
  select r.key, r.value, r.description, r.updated_at
  from public.remote_config r
  order by r.key;
end;
$$;

create or replace function public.admin_remote_config_set(
  p_key text,
  p_value jsonb,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid()
      and a.is_active = true
      and a.role in ('SUPER_ADMIN','ADMIN')
  ) then
    raise exception 'admin_required';
  end if;

  if p_key is null or length(btrim(p_key)) < 2 then
    raise exception 'invalid_key';
  end if;

  select to_jsonb(r) into v_before
  from public.remote_config r
  where r.key = p_key;

  insert into public.remote_config(key, value, description, updated_at, updated_by)
  values (p_key, p_value, p_description, now(), auth.uid())
  on conflict (key) do update set
    value = excluded.value,
    description = coalesce(excluded.description, public.remote_config.description),
    updated_at = now(),
    updated_by = auth.uid();

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  values (
    auth.uid(),
    'remote_config.updated',
    'remote_config',
    null,
    v_before,
    jsonb_build_object('key', p_key, 'value', p_value, 'description', p_description)
  );
end;
$$;

grant execute on function public.admin_remote_config_list() to authenticated;
grant execute on function public.admin_remote_config_set(text,jsonb,text) to authenticated;
