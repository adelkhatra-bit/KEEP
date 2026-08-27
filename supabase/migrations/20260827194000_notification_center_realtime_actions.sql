create or replace function public.keep_notification_action(
  p_action text,
  p_notification_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_action text := lower(trim(coalesce(p_action, '')));
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if v_action = 'read' then
    if p_notification_id is null then raise exception 'notification_id_required'; end if;
    update public.notifications
       set read_at = coalesce(read_at, now())
     where profile_id = v_user_id
       and id = p_notification_id;
  elsif v_action = 'read_all' then
    update public.notifications
       set read_at = now()
     where profile_id = v_user_id
       and read_at is null;
  elsif v_action = 'delete' then
    if p_notification_id is null then raise exception 'notification_id_required'; end if;
    delete from public.notifications
     where profile_id = v_user_id
       and id = p_notification_id;
  elsif v_action = 'delete_all' then
    delete from public.notifications
     where profile_id = v_user_id;
  else
    raise exception 'unsupported_notification_action';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.keep_notification_action(text, uuid) from public;
grant execute on function public.keep_notification_action(text, uuid) to authenticated;

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
  v_artwork_url text;
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

  select t.title, t.artist, t.artwork_url into v_title, v_artist, v_artwork_url
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
        'Nouveau KEEP de @' || coalesce(v_username, 'KEEP'),
        trim(both ' ' from coalesce(v_title, 'Nouveau morceau') ||
          case when v_artist is not null and v_artist <> '' then ' — ' || v_artist else '' end ||
          ' · ajouté à son profil.'),
        jsonb_build_object(
          'ownerProfileId', new.profile_id,
          'username', v_username,
          'trackId', new.track_id,
          'decisionId', new.id,
          'trackTitle', v_title,
          'trackArtist', v_artist,
          'artworkUrl', v_artwork_url,
          'kind', 'new_public_keep'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

update public.notifications n
set data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object(
  'trackTitle', t.title,
  'trackArtist', t.artist,
  'artworkUrl', t.artwork_url
)
from public.tracks t
where n.type = 'NEW_PUBLIC_KEEP'
  and n.data->>'trackId' = t.id::text;
