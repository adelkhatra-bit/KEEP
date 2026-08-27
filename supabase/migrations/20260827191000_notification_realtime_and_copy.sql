-- KEEP 2026-08-27
-- Active les notifications temps réel pour le petit popup web et affine le
-- message envoyé aux abonnés lorsqu'un utilisateur publie un nouveau KEEP.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

create or replace function public.notify_followers_on_public_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_title text;
  v_artist text;
  v_follower record;
begin
  if new.decision <> 'KEPT' or new.visibility <> 'PUBLIC' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.decision = 'KEPT'
     and old.visibility = 'PUBLIC' then
    return new;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = new.profile_id;

  select t.title, t.artist into v_title, v_artist
  from public.tracks t
  where t.id = new.track_id;

  for v_follower in
    select f.follower_id
    from public.follows f
    left join public.notification_preferences np
      on np.profile_id = f.follower_id
    where f.followee_id = new.profile_id
      and coalesce(np.social_enabled, true) = true
  loop
    insert into public.profile_music_notification_sends(decision_id, follower_id)
    values (new.id, v_follower.follower_id)
    on conflict do nothing;

    if found then
      insert into public.notifications(profile_id, type, title, body, data)
      values (
        v_follower.follower_id,
        'NEW_PUBLIC_KEEP',
        '@' || coalesce(v_username, 'KEEP') || ' a ajouté une musique',
        trim(both ' ' from coalesce(v_title, 'Nouveau KEEP') ||
          case when v_artist is not null and v_artist <> '' then ' — ' || v_artist else '' end ||
          '. Elle pourrait te plaire · ouvre son profil.'),
        jsonb_build_object(
          'ownerProfileId', new.profile_id,
          'username', v_username,
          'trackId', new.track_id,
          'decisionId', new.id,
          'kind', 'new_public_keep'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_followers_on_public_keep() from public;
