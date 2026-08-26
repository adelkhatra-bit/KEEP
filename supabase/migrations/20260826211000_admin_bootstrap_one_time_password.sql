-- KEEP Super Admin — bootstrap de mot de passe à usage unique.
-- Aucun mot de passe ni hash de production n'est versionné dans Git.

create table if not exists public.admin_bootstrap_tokens (
  email text primary key,
  password_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_bootstrap_tokens enable row level security;
revoke all on public.admin_bootstrap_tokens from anon, authenticated;
grant all on public.admin_bootstrap_tokens to service_role;

create or replace function public.consume_admin_bootstrap_token(p_email text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  token_row public.admin_bootstrap_tokens%rowtype;
  admin_id uuid;
begin
  select * into token_row
  from public.admin_bootstrap_tokens
  where lower(email)=lower(trim(p_email))
  for update;

  if token_row.email is null
     or token_row.used_at is not null
     or token_row.expires_at <= now()
     or crypt(p_password, token_row.password_hash) <> token_row.password_hash then
    return null;
  end if;

  select au.id into admin_id
  from public.admin_users au
  join auth.users u on u.id=au.id
  where lower(u.email)=lower(trim(p_email))
    and au.is_active=true
    and au.role='SUPER_ADMIN'
  limit 1;

  if admin_id is null then return null; end if;

  update public.admin_bootstrap_tokens
  set used_at=now()
  where lower(email)=lower(trim(p_email));

  return admin_id;
end;
$$;

revoke all on function public.consume_admin_bootstrap_token(text,text) from public, anon, authenticated;
grant execute on function public.consume_admin_bootstrap_token(text,text) to service_role;
