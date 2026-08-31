create or replace function public.request_social_link(target_profile_id uuid, requested_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  requester_username text;
  social_allowed boolean := true;
begin
  if requester_id is null then
    raise exception 'authentication_required';
  end if;
  if target_profile_id is null or target_profile_id = requester_id then
    return;
  end if;
  if requested_platform not in ('instagram','tiktok','facebook','snapchat','youtube','x','website','other') then
    raise exception 'unsupported_platform';
  end if;
  if not exists (select 1 from public.profiles where id = target_profile_id and is_public = true) then
    raise exception 'profile_not_available';
  end if;

  select username into requester_username from public.profiles where id = requester_id;
  select coalesce(np.social_enabled, true)
    into social_allowed
    from public.notification_preferences np
   where np.profile_id = target_profile_id;
  social_allowed := coalesce(social_allowed, true);

  if social_allowed and not exists (
    select 1
      from public.notifications n
     where n.profile_id = target_profile_id
       and n.type = 'social_request'
       and n.read_at is null
       and n.data->>'requester_id' = requester_id::text
       and n.data->>'platform' = requested_platform
       and n.created_at > now() - interval '24 hours'
  ) then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      target_profile_id,
      'social_request',
      'Demande de réseau social',
      coalesce('@' || requester_username, 'Un utilisateur KEEP') || ' aimerait accéder à ton ' || requested_platform || '. Tu peux ajouter le lien depuis Modifier le profil.',
      jsonb_build_object('requester_id', requester_id, 'requester_username', requester_username, 'platform', requested_platform)
    );
  end if;
end;
$$;

revoke all on function public.request_social_link(uuid, text) from public;
grant execute on function public.request_social_link(uuid, text) to authenticated;
