-- Keep chat settings backward compatible across already-deployed clients,
-- and persist the floating bubble position per profile.

alter table public.profiles
  add column if not exists community_chat_enabled boolean not null default false,
  add column if not exists community_chat_surfaces text[] not null default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[],
  add column if not exists community_chat_activation_notified_at timestamptz,
  add column if not exists community_chat_side text not null default 'right',
  add column if not exists community_chat_bottom_offset integer not null default 88;

alter table public.profiles drop constraint if exists profiles_community_chat_side_check;
alter table public.profiles add constraint profiles_community_chat_side_check check (community_chat_side in ('left','right'));
alter table public.profiles drop constraint if exists profiles_community_chat_bottom_offset_check;
alter table public.profiles add constraint profiles_community_chat_bottom_offset_check check (community_chat_bottom_offset between 72 and 800);

update public.profiles
set community_chat_enabled=coalesce(community_chat_home_enabled,false)
where community_chat_enabled is distinct from coalesce(community_chat_home_enabled,false);

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
    'surfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE"]'::jsonb),
    'visibleSurfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE"]'::jsonb),
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
  p_surfaces text[] default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[]
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
    from unnest(coalesce(p_surfaces,array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[])) x
    where upper(trim(x))=any(array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[])
    order by 1
  ) into v_surfaces;

  if coalesce(cardinality(v_surfaces),0)=0 then
    v_surfaces:=array['PROFILE']::text[];
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

create or replace function public.keep_agora_set_position(p_side text,p_bottom_offset integer)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  update public.profiles
  set community_chat_side=case when lower(coalesce(p_side,''))='left' then 'left' else 'right' end,
      community_chat_bottom_offset=greatest(72,least(coalesce(p_bottom_offset,88),800))
  where id=v_uid;
  return public.keep_agora_my_settings();
end;
$function$;

revoke all on function public.keep_agora_set_position(text,integer) from public,anon;
grant execute on function public.keep_agora_set_position(text,integer) to authenticated;

-- Normalize the activation notification to one canonical type.
insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
select p.id,'AGORA_ACTIVATE','💬 Active ton Tchat flottant',
       'Choisis où il apparaît : Loki Music, Découvertes, Playlists, Soirées ou Profil. Tu peux le déplacer à droite ou à gauche.',
       jsonb_build_object('event','AGORA_ACTIVATE','action','OPEN_CHAT_SETTINGS'),
       'CREATED',0
from public.profiles p
where coalesce(p.community_chat_enabled,false)=false
  and not exists (
    select 1 from public.notifications n
    where n.profile_id=p.id and n.type='AGORA_ACTIVATE'
  );

update public.profiles p
set community_chat_activation_notified_at=coalesce(p.community_chat_activation_notified_at,now())
where exists(select 1 from public.notifications n where n.profile_id=p.id and n.type='AGORA_ACTIVATE');
