-- KEEP : un nouveau compte e-mail n'est public qu'après validation de l'adresse.
-- L'intention « + Suivre » est conservée dans les métadonnées Auth puis appliquée
-- automatiquement au moment exact où l'e-mail est confirmé.

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
  if keep_username is null then return new; end if;

  insert into public.profiles (
    id, username, display_name, bio, avatar_url, country_code, city, kind,
    language_code, is_public, location_opt_in
  ) values (
    new.id, keep_username, keep_username, '', null, null, null, 'USER',
    'fr', new.email_confirmed_at is not null, false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.keep_activate_verified_email_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  follow_username text;
  target_id uuid;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles set is_public = true, updated_at = now() where id = new.id;

    follow_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'pending_follow_username', '')), '');
    if follow_username is not null then
      select p.id into target_id
      from public.profiles p
      where lower(p.username) = lower(follow_username)
        and p.is_public = true
        and p.id <> new.id
      order by p.created_at asc
      limit 1;

      if target_id is not null then
        insert into public.follows(follower_id, followee_id)
        values(new.id, target_id)
        on conflict (follower_id, followee_id) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_activate_verified_email_profile on auth.users;
create trigger trg_keep_activate_verified_email_profile
after update of email_confirmed_at on auth.users
for each row execute function public.keep_activate_verified_email_profile();
