-- Loki Music branding + privacy hardening for public-track notifications.
-- Additive follow-up: never rewrites the historical 20261003008000 migration.

create or replace function public.notify_followers_on_public_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
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
        'Nouveau morceau chez @' || coalesce(nullif(v_username, ''), 'Loki'),
        'Titre masqué · écoute l’extrait et garde-le pour découvrir le titre.',
        jsonb_build_object(
          'ownerProfileId', new.profile_id,
          'username', v_username,
          'trackId', new.track_id,
          'decisionId', new.id,
          'masked', true,
          'kind', 'new_public_keep'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_followers_on_public_keep() from public, anon, authenticated;
grant execute on function public.notify_followers_on_public_keep() to service_role;

-- Les anciennes notifications deviennent cohérentes immédiatement dans
-- l'historique de l'app ; les clés titre/artiste/pochette sont retirées.
update public.notifications
set
  title = 'Nouveau morceau chez @' || coalesce(nullif(data->>'username', ''), 'Loki'),
  body = 'Titre masqué · écoute l’extrait et garde-le pour découvrir le titre.',
  data = ((coalesce(data, '{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl') || '{"masked":true}'::jsonb)
where type = 'NEW_PUBLIC_KEEP';
