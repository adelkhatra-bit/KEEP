-- Optional, privacy-preserving voice cue for the global Loki chat.
-- The cue announces only the sender identity ("Message de @pseudo"), never message content.

alter table public.profiles
  add column if not exists community_chat_voice_announcements boolean not null default false;

create or replace function public.keep_agora_my_settings()
returns jsonb
language sql
stable
security definer
set search_path to 'public','auth'
as $$
  select jsonb_build_object(
    'enabled',coalesce(p.community_chat_enabled,p.community_chat_home_enabled,false),
    'homeEnabled',coalesce(p.community_chat_enabled,p.community_chat_home_enabled,false),
    'notificationsEnabled',coalesce(p.community_chat_notifications,true),
    'voiceAnnouncements',coalesce(p.community_chat_voice_announcements,false),
    'surfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE","NOTIFICATIONS"]'::jsonb),
    'visibleSurfaces',coalesce(to_jsonb(p.community_chat_surfaces),'["LISTEN","DISCOVER","PLAYLISTS","PARTIES","PROFILE","NOTIFICATIONS"]'::jsonb),
    'side',coalesce(p.community_chat_side,'right'),
    'bottomOffset',coalesce(p.community_chat_bottom_offset,88)
  )
  from public.profiles p
  where p.id=auth.uid();
$$;

create or replace function public.keep_agora_set_voice_announcements(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  update public.profiles
  set community_chat_voice_announcements=coalesce(p_enabled,false)
  where id=v_uid;

  return public.keep_agora_my_settings();
end;
$$;

revoke all on function public.keep_agora_set_voice_announcements(boolean) from public, anon;
grant execute on function public.keep_agora_set_voice_announcements(boolean) to authenticated;
