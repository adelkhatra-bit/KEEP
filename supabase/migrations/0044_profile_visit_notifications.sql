create or replace function public.notify_profile_view(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_username text;
  social_allowed boolean := true;
begin
  if viewer_id is null then
    return;
  end if;
  if target_profile_id is null or target_profile_id = viewer_id then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = target_profile_id and is_public = true) then
    return;
  end if;

  select username into viewer_username from public.profiles where id = viewer_id;
  if viewer_username is null then
    return;
  end if;

  select coalesce(np.social_enabled, true)
    into social_allowed
    from public.notification_preferences np
   where np.profile_id = target_profile_id;
  social_allowed := coalesce(social_allowed, true);

  if social_allowed and not exists (
    select 1
      from public.notifications n
     where n.profile_id = target_profile_id
       and n.type = 'profile_view'
       and n.data->>'viewer_id' = viewer_id::text
       and n.created_at > now() - interval '12 hours'
  ) then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      target_profile_id,
      'profile_view',
      'Visite de ton profil',
      '@' || viewer_username || ' a consulté ton profil KEEP.',
      jsonb_build_object('viewer_id', viewer_id, 'viewer_username', viewer_username)
    );
  end if;
end;
$$;

revoke all on function public.notify_profile_view(uuid) from public;
grant execute on function public.notify_profile_view(uuid) to authenticated;
