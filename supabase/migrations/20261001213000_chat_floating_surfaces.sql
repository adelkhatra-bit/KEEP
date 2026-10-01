-- Personal floating chat placement + one-time activation prompt.
-- Structural chat behavior is global; enablement, notifications and visible
-- surfaces remain strictly per-profile settings.

alter table public.profiles
  add column if not exists community_chat_enabled boolean not null default false,
  add column if not exists community_chat_surfaces text[] not null
    default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[],
  add column if not exists community_chat_activation_notified_at timestamptz;

update public.profiles
set community_chat_enabled = coalesce(community_chat_home_enabled,false)
where community_chat_enabled = false
  and coalesce(community_chat_home_enabled,false) = true;

alter table public.profiles
  drop constraint if exists profiles_community_chat_surfaces_check;
alter table public.profiles
  add constraint profiles_community_chat_surfaces_check
  check (
    community_chat_surfaces <@ array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[]
  );

create or replace function public.keep_agora_my_settings()
returns jsonb
language sql
stable
security definer
set search_path=public,auth
as $function$
  select jsonb_build_object(
    'enabled',coalesce(p.community_chat_enabled,false),
    'homeEnabled',coalesce(p.community_chat_home_enabled,false),
    'notificationsEnabled',coalesce(p.community_chat_notifications,true),
    'visibleSurfaces',coalesce(
      p.community_chat_surfaces,
      array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[]
    )
  )
  from public.profiles p
  where p.id=auth.uid();
$function$;

drop function if exists public.keep_agora_set_settings_v2(boolean,boolean,text[]);
create or replace function public.keep_agora_set_settings_v2(
  p_enabled boolean,
  p_notifications_enabled boolean default true,
  p_visible_surfaces text[] default null
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
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select coalesce(
    array(
      select distinct upper(trim(x))
      from unnest(coalesce(
        p_visible_surfaces,
        array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[]
      )) x
      where upper(trim(x)) = any(array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[])
      order by 1
    ),
    array[]::text[]
  ) into v_surfaces;

  update public.profiles
  set community_chat_enabled=coalesce(p_enabled,false),
      community_chat_notifications=coalesce(p_notifications_enabled,true),
      community_chat_surfaces=v_surfaces,
      community_chat_activation_notified_at=
        case when coalesce(p_enabled,false) then coalesce(community_chat_activation_notified_at,now())
             else community_chat_activation_notified_at end
  where id=v_uid;

  if coalesce(p_enabled,false) then
    select coalesce(max(id),0) into v_latest
    from public.music_agora_messages
    where room_slug='place'
      and moderation_status='VISIBLE'
      and target_profile_id is null;

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

create or replace function public.keep_chat_activation_prompt_on_profile()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
begin
  if coalesce(new.community_chat_enabled,false)=false then
    insert into public.notifications(
      profile_id,type,title,body,data,push_delivery_status,push_attempt_count
    )
    values(
      new.id,
      'AGORA_ACTIVATE',
      '💬 Active ton Tchat flottant',
      'Choisis où il apparaît : Loki Music, Découvertes, Playlists, Soirées ou Profil. Tu peux le déplacer à droite ou à gauche.',
      jsonb_build_object(
        'event','AGORA_ACTIVATE',
        'action','OPEN_CHAT_SETTINGS'
      ),
      'CREATED',
      0
    );
    update public.profiles
      set community_chat_activation_notified_at=now()
      where id=new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_chat_activation_prompt on public.profiles;
create trigger trg_keep_chat_activation_prompt
after insert on public.profiles
for each row execute function public.keep_chat_activation_prompt_on_profile();

with targets as (
  select p.id
  from public.profiles p
  where coalesce(p.community_chat_enabled,false)=false
    and p.community_chat_activation_notified_at is null
    and not exists (
      select 1 from public.notifications n
      where n.profile_id=p.id
        and n.type='AGORA_ACTIVATE'
    )
)
insert into public.notifications(
  profile_id,type,title,body,data,push_delivery_status,push_attempt_count
)
select
  t.id,
  'AGORA_ACTIVATE',
  '💬 Active ton Tchat flottant',
  'Choisis où il apparaît : Loki Music, Découvertes, Playlists, Soirées ou Profil. Tu peux le déplacer à droite ou à gauche.',
  jsonb_build_object('event','AGORA_ACTIVATE','action','OPEN_CHAT_SETTINGS'),
  'CREATED',
  0
from targets t;

update public.profiles p
set community_chat_activation_notified_at=now()
where p.community_chat_activation_notified_at is null
  and exists (
    select 1 from public.notifications n
    where n.profile_id=p.id
      and n.type='AGORA_ACTIVATE'
  );
