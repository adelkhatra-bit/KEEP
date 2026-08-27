-- One notification path for every follow source (Discover, public profile, RPC).
-- The trigger prevents client differences from changing notification behavior.
create or replace function public.keep_notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  follower_username text;
  social_notifications_enabled boolean := true;
begin
  select username into follower_username from public.profiles where id = new.follower_id;
  select coalesce(np.social_enabled, true)
    into social_notifications_enabled
    from public.notification_preferences np
    where np.profile_id = new.followee_id;
  if not found then social_notifications_enabled := true; end if;

  if social_notifications_enabled then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      new.followee_id,
      'NEW_FOLLOWER',
      'Nouvel abonné',
      coalesce('@' || follower_username, 'Un utilisateur') || ' aime ton univers musical et vient de s’abonner à ton profil.',
      jsonb_build_object('follower_id', new.follower_id, 'follower_username', follower_username)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.keep_notify_new_follower() from public, anon, authenticated;

drop trigger if exists trg_keep_notify_new_follower on public.follows;
create trigger trg_keep_notify_new_follower
after insert on public.follows
for each row execute function public.keep_notify_new_follower();

-- The RPC now only owns identity-safe insertion; notification comes from the trigger.
create or replace function public.keep_follow_profile(p_followee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  inserted_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_followee_id is null then raise exception 'followee_required'; end if;
  if uid = p_followee_id then return false; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'follower_profile_missing'; end if;
  if not exists (select 1 from public.profiles where id = p_followee_id and is_public = true) then raise exception 'followee_profile_missing'; end if;
  insert into public.follows(follower_id, followee_id)
  values (uid, p_followee_id)
  on conflict (follower_id, followee_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;
revoke all on function public.keep_follow_profile(uuid) from public, anon;
grant execute on function public.keep_follow_profile(uuid) to authenticated;
