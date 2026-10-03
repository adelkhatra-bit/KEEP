-- Loki Super Admin — code de secours autonome, sans e-mail.
-- Généré uniquement par une Edge Function déjà authentifiée SUPER_ADMIN.
-- Le secret n'est jamais stocké en clair : uniquement bcrypt via pgcrypto.

create or replace function public.service_issue_admin_bootstrap_token(
  p_email text,
  p_password text,
  p_ttl_minutes integer default 10080
)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  clean_email text := lower(trim(coalesce(p_email,'')));
  expires timestamptz;
  ttl integer := least(greatest(coalesce(p_ttl_minutes,10080),5),43200);
  admin_ok boolean;
begin
  if clean_email = '' or position('@' in clean_email) < 2 then
    raise exception 'invalid_email';
  end if;
  if length(coalesce(p_password,'')) < 12 or length(p_password) > 128 then
    raise exception 'invalid_password';
  end if;

  select exists (
    select 1
    from public.admin_users au
    join auth.users u on u.id = au.id
    where lower(u.email) = clean_email
      and au.is_active = true
      and au.role = 'SUPER_ADMIN'
  ) into admin_ok;

  if not admin_ok then
    raise exception 'super_admin_required';
  end if;

  expires := now() + make_interval(mins => ttl);

  insert into public.admin_bootstrap_tokens(email,password_hash,expires_at,used_at,created_at)
  values (
    clean_email,
    crypt(p_password, gen_salt('bf')),
    expires,
    null,
    now()
  )
  on conflict (email) do update
  set password_hash = excluded.password_hash,
      expires_at = excluded.expires_at,
      used_at = null,
      created_at = now();

  return expires;
end;
$$;

revoke all on function public.service_issue_admin_bootstrap_token(text,text,integer) from public, anon, authenticated;
grant execute on function public.service_issue_admin_bootstrap_token(text,text,integer) to service_role;
