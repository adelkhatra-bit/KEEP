-- KEEP — 0041: création du profil à partir de l'inscription e-mail Supabase Auth.
-- L'adresse e-mail reste l'identifiant privé. Le pseudo est public, stocké une
-- seule fois dans profiles puis modifiable depuis Modifier le profil.

create or replace function public.keep_create_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_username text;
begin
  keep_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'keep_username', '')), '');

  -- Les comptes Admin/OAuth historiques sans keep_username ne sont pas touchés.
  if keep_username is null then
    return new;
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    bio,
    avatar_url,
    country_code,
    city,
    kind,
    language_code,
    is_public,
    location_opt_in
  ) values (
    new.id,
    keep_username,
    keep_username,
    '',
    null,
    null,
    null,
    'USER',
    'fr',
    true,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_keep_auth_user_profile on auth.users;
create trigger trg_keep_auth_user_profile
  after insert on auth.users
  for each row execute function public.keep_create_profile_from_auth_user();
