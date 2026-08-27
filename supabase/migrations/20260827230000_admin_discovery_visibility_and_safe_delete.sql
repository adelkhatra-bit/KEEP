-- KEEP Super Admin: allow a profile to stay public/shareable while being
-- explicitly hidden from Discover.
alter table public.profiles
  add column if not exists discovery_hidden boolean not null default false;

comment on column public.profiles.discovery_hidden is
  'When true, the profile is excluded from KEEP Discover without disabling its public profile URL.';

create index if not exists profiles_discovery_visibility_idx
  on public.profiles (is_public, discovery_hidden);

-- Active admin identities are operational accounts, not discovery suggestions.
update public.profiles p
set discovery_hidden = true
where exists (
  select 1
  from public.admin_users a
  where a.id = p.id
    and a.is_active = true
);

-- Deleting a profile cascades through follows. The follow DELETE trigger must
-- not create a notification for a profile that is itself being deleted.
create or replace function public.keep_notify_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  target_id uuid;
  actor_username text;
  social_notifications_enabled boolean := true;
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if tg_op = 'INSERT' then
    actor_id := new.follower_id;
    target_id := new.followee_id;
    notification_type := 'NEW_FOLLOWER';
    notification_title := 'Nouvel abonné';
  elsif tg_op = 'DELETE' then
    actor_id := old.follower_id;
    target_id := old.followee_id;
    notification_type := 'FOLLOWER_LEFT';
    notification_title := 'Désabonnement';
  else
    return coalesce(new, old);
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select coalesce(np.social_enabled, true)
    into social_notifications_enabled
    from public.notification_preferences np
   where np.profile_id = target_id;
  if not found then
    social_notifications_enabled := true;
  end if;

  if social_notifications_enabled then
    select p.username into actor_username
      from public.profiles p
     where p.id = actor_id;

    if tg_op = 'INSERT' then
      notification_body := coalesce('@' || actor_username, 'Un utilisateur') || ' vient de s’abonner à ton profil KEEP.';
    else
      notification_body := coalesce('@' || actor_username, 'Un utilisateur') || ' ne suit plus ton profil KEEP.';
    end if;

    insert into public.notifications(profile_id, type, title, body, data)
    values (
      target_id,
      notification_type,
      notification_title,
      notification_body,
      jsonb_build_object(
        'actor_id', actor_id,
        'actor_username', actor_username,
        'followee_id', target_id
      )
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;