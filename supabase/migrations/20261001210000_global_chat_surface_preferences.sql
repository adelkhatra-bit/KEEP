-- Global movable chat: persisted visibility per main app surface + opt-in notification.
alter table public.profiles
  add column if not exists community_chat_home_enabled boolean not null default false,
  add column if not exists community_chat_notifications boolean not null default true;

alter table public.profiles
  add column if not exists community_chat_surfaces text[] not null
  default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[];

update public.profiles
set community_chat_surfaces=array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[]
where community_chat_surfaces is null or cardinality(community_chat_surfaces)=0;

create or replace function public.keep_agora_my_settings()
returns jsonb
language sql
stable
security definer
set search_path=public,auth
as $function$
  select jsonb_build_object(
    'homeEnabled',coalesce(p.community_chat_home_enabled,false),
    'notificationsEnabled',coalesce(p.community_chat_notifications,true),
    'surfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE"]'::jsonb)
  )
  from public.profiles p
  where p.id=auth.uid();
$function$;

create or replace function public.keep_agora_set_settings_v2(
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

  select coalesce(array_agg(distinct upper(x) order by upper(x)),array[]::text[])
    into v_surfaces
  from unnest(coalesce(p_surfaces,array[]::text[])) x
  where upper(x) = any(array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']);

  if cardinality(v_surfaces)=0 then
    v_surfaces := array['PROFILE']::text[];
  end if;

  update public.profiles
  set community_chat_home_enabled=coalesce(p_home_enabled,false),
      community_chat_notifications=coalesce(p_notifications_enabled,true),
      community_chat_surfaces=v_surfaces
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
    set notifications_enabled=excluded.notifications_enabled,
        updated_at=now();
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

insert into public.notifications(profile_id,type,title,body,data)
select p.id,
       'CHAT_ACTIVATION_AVAILABLE',
       'Active ton chat Loki',
       'Choisis où afficher ton mini-chat : Écouter, Découvertes, Playlists, Soirées et Profil. Tu peux le déplacer à gauche ou à droite.',
       jsonb_build_object(
         'event','CHAT_ACTIVATION_AVAILABLE',
         'surfaces',jsonb_build_array('LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'),
         'soundKind','social'
       )
from public.profiles p
where not exists (
  select 1 from public.notifications n
  where n.profile_id=p.id and n.type='CHAT_ACTIVATION_AVAILABLE'
);

create or replace function public.keep_seed_chat_activation_notification()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  insert into public.notifications(profile_id,type,title,body,data)
  values(
    new.id,
    'CHAT_ACTIVATION_AVAILABLE',
    'Active ton chat Loki',
    'Choisis où afficher ton mini-chat : Écouter, Découvertes, Playlists, Soirées et Profil. Tu peux le déplacer à gauche ou à droite.',
    jsonb_build_object(
      'event','CHAT_ACTIVATION_AVAILABLE',
      'surfaces',jsonb_build_array('LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'),
      'soundKind','social'
    )
  );
  return new;
end;
$function$;

drop trigger if exists trg_keep_seed_chat_activation_notification on public.profiles;
create trigger trg_keep_seed_chat_activation_notification
after insert on public.profiles
for each row execute function public.keep_seed_chat_activation_notification();

revoke all on function public.keep_seed_chat_activation_notification() from public,anon,authenticated;
