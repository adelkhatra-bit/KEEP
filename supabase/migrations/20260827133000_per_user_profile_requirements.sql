-- Per-user obligations controlled by KEEP Super Admin.
-- A checked requirement is read only by the owner and written only through
-- the service-role admin function. This keeps the user UI simple while letting
-- KEEP progressively require missing profile information without changing all users.

create table if not exists public.user_profile_requirements (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  requirements jsonb not null default '[]'::jsonb,
  updated_by uuid null references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint user_profile_requirements_array check (jsonb_typeof(requirements) = 'array')
);

alter table public.user_profile_requirements enable row level security;

revoke all on table public.user_profile_requirements from public, anon;
grant select on table public.user_profile_requirements to authenticated;

drop policy if exists user_profile_requirements_select_own on public.user_profile_requirements;
create policy user_profile_requirements_select_own
on public.user_profile_requirements
for select
to authenticated
using (profile_id = auth.uid());

-- Only these stable keys are accepted. New requirements can be added later by
-- extending this constraint and the two UIs; arbitrary values can never be injected.
create or replace function public.keep_validate_profile_requirements()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
begin
  for item in select value from jsonb_array_elements(new.requirements)
  loop
    if jsonb_typeof(item) <> 'string' or trim(both '"' from item::text) not in (
      'EMAIL_VERIFIED','BIRTH_DATE','GENDER','AVATAR','CITY','COUNTRY','BIO','SOCIAL_LINK','WEBSITE'
    ) then
      raise exception 'invalid_profile_requirement';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.keep_validate_profile_requirements() from public, anon, authenticated;

drop trigger if exists trg_keep_validate_profile_requirements on public.user_profile_requirements;
create trigger trg_keep_validate_profile_requirements
before insert or update on public.user_profile_requirements
for each row execute function public.keep_validate_profile_requirements();

-- SECURITY: trigger helpers on auth.users are not RPC endpoints.
revoke all on function public.keep_create_profile_from_auth_user() from public, anon, authenticated;
revoke all on function public.keep_activate_verified_email_profile() from public, anon, authenticated;
