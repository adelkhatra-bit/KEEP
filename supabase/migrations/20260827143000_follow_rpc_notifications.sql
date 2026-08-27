-- Reliable follow/unfollow RPCs for KEEP. They bind follower_id to auth.uid(),
-- avoid client-side identity drift and create one social notification only when
-- a new relationship is actually inserted.

create or replace function public.keep_follow_profile(p_followee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  inserted_count integer := 0;
  follower_username text;
  social_notifications_enabled boolean := true;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;
  if p_followee_id is null then
    raise exception 'followee_required';
  end if;
  if uid = p_followee_id then
    return false;
  end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'follower_profile_missing';
  end if;
  if not exists (select 1 from public.profiles where id = p_followee_id and is_public = true) then
    raise exception 'followee_profile_missing';
  end if;

  insert into public.follows(follower_id, followee_id)
  values (uid, p_followee_id)
  on conflict (follower_id, followee_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    select username into follower_username from public.profiles where id = uid;
    select coalesce(np.social_enabled, true)
      into social_notifications_enabled
      from public.notification_preferences np
      where np.profile_id = p_followee_id;
    if not found then social_notifications_enabled := true; end if;

    if social_notifications_enabled then
      insert into public.notifications(profile_id, type, title, body, data)
      values (
        p_followee_id,
        'NEW_FOLLOWER',
        'Nouvel abonné',
        coalesce('@' || follower_username, 'Un utilisateur') || ' aime ton univers musical et vient de s’abonner à ton profil.',
        jsonb_build_object('follower_id', uid, 'follower_username', follower_username)
      );
    end if;
  end if;

  return inserted_count > 0;
end;
$$;

revoke all on function public.keep_follow_profile(uuid) from public, anon;
grant execute on function public.keep_follow_profile(uuid) to authenticated;

create or replace function public.keep_unfollow_profile(p_followee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  deleted_count integer := 0;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;
  if p_followee_id is null then
    raise exception 'followee_required';
  end if;

  delete from public.follows
  where follower_id = uid and followee_id = p_followee_id;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.keep_unfollow_profile(uuid) from public, anon;
grant execute on function public.keep_unfollow_profile(uuid) to authenticated;
