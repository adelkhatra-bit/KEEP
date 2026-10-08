-- Make Notifications a first-class location for the floating Loki chat.
alter table public.profiles
  drop constraint if exists profiles_community_chat_surfaces_check;
alter table public.profiles
  add constraint profiles_community_chat_surfaces_check
  check (
    community_chat_surfaces <@ array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[]
  );

update public.profiles
set community_chat_surfaces = case
  when community_chat_surfaces @> array['NOTIFICATIONS']::text[]
    then community_chat_surfaces
  else community_chat_surfaces || 'NOTIFICATIONS'::text
end
where community_chat_surfaces is not null;

create or replace function public.keep_agora_my_settings()
returns jsonb
language sql
stable
security definer
set search_path=public,auth
as $function$
  select jsonb_build_object(
    'enabled',coalesce(p.community_chat_enabled,p.community_chat_home_enabled,false),
    'homeEnabled',coalesce(p.community_chat_enabled,p.community_chat_home_enabled,false),
    'notificationsEnabled',coalesce(p.community_chat_notifications,true),
    'surfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE","NOTIFICATIONS"]'::jsonb),
    'visibleSurfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE","NOTIFICATIONS"]'::jsonb),
    'side',coalesce(p.community_chat_side,'right'),
    'bottomOffset',coalesce(p.community_chat_bottom_offset,88)
  )
  from public.profiles p
  where p.id=auth.uid();
$function$;

drop function if exists public.keep_agora_set_settings_v2(boolean,boolean,text[]);
create function public.keep_agora_set_settings_v2(
  p_home_enabled boolean,
  p_notifications_enabled boolean default true,
  p_surfaces text[] default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_latest bigint := 0;
  v_surfaces text[];
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select array(
    select distinct upper(trim(x))
    from unnest(coalesce(p_surfaces,array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[])) x
    where upper(trim(x))=any(array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[])
    order by 1
  ) into v_surfaces;

  if coalesce(cardinality(v_surfaces),0)=0 then
    v_surfaces:=array['NOTIFICATIONS']::text[];
  end if;

  update public.profiles
  set community_chat_enabled=coalesce(p_home_enabled,false),
      community_chat_home_enabled=coalesce(p_home_enabled,false),
      community_chat_notifications=coalesce(p_notifications_enabled,true),
      community_chat_surfaces=v_surfaces,
      community_chat_activation_notified_at=case
        when coalesce(p_home_enabled,false) then coalesce(community_chat_activation_notified_at,now())
        else community_chat_activation_notified_at end
  where id=v_uid;

  if coalesce(p_home_enabled,false) then
    select coalesce(max(id),0) into v_latest
    from public.music_agora_messages
    where room_slug='place' and moderation_status='VISIBLE' and target_profile_id is null;

    insert into public.music_agora_room_subscriptions(
      profile_id,room_slug,notifications_enabled,last_notified_message_id,last_read_message_id
    )
    values(v_uid,'place',coalesce(p_notifications_enabled,true),v_latest,v_latest)
    on conflict(profile_id,room_slug) do update
    set notifications_enabled=excluded.notifications_enabled,updated_at=now();
  else
    update public.music_agora_room_subscriptions
    set notifications_enabled=false,updated_at=now()
    where profile_id=v_uid;
  end if;

  return public.keep_agora_my_settings();
end;
$function$;

revoke all on function public.keep_agora_set_settings_v2(boolean,boolean,text[]) from public,anon;
grant execute on function public.keep_agora_set_settings_v2(boolean,boolean,text[]) to authenticated;

update public.notifications
set body='Choisis où afficher ton mini-chat : Écouter, Découvertes, Playlists, Soirées, Profil ou Notifications. Tu peux le déplacer à gauche ou à droite.'
where type in ('CHAT_ACTIVATION_AVAILABLE','AGORA_ACTIVATE');
