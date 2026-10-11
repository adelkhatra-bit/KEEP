-- Align Loki Messenger limits with the mobile composer.
-- Root cause fixed:
--   * UI/RPC accepted up to 2000 characters
--   * public.music_agora_messages still enforced the historical 280-char check
-- Also remove the obsolete "3 unanswered direct messages" blocker. Keep the
-- existing anti-spam throttles (4/minute, 30/hour) and all moderation/blocks.

alter table public.music_agora_messages
  drop constraint if exists music_agora_messages_body_check;

alter table public.music_agora_messages
  add constraint music_agora_messages_body_check
  check (char_length(body) between 1 and 2000);

create or replace function public.keep_agora_post_message_v2(
  p_room_slug text,
  p_body text default '',
  p_target_profile_id uuid default null,
  p_shared_track_id uuid default null,
  p_reveal_mode text default 'NONE'
)
returns bigint
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body,''));
  v_mode text := upper(coalesce(p_reveal_mode,'NONE'));
  v_id bigint;
  v_is_reaction boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.is_public=true) then
    raise exception 'public_profile_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    raise exception 'room_unavailable' using errcode='22023';
  end if;

  v_is_reaction := v_body = any(array[
    '❤️','🔥','👏','🎵','😂','🤯','🙌','⚡','[[KEEP_LOKI_REACTION]]'
  ]::text[]);

  if p_shared_track_id is null and ((char_length(v_body)<1 and not v_is_reaction) or char_length(v_body)>2000) then
    raise exception 'message_length' using errcode='22023';
  end if;
  if p_shared_track_id is not null and char_length(v_body)>2000 then
    raise exception 'message_length' using errcode='22023';
  end if;
  if v_body<>'' and not v_is_reaction and public.keep_agora_contains_blocked_language(v_body) then
    raise exception 'message_blocked_language' using errcode='22023';
  end if;
  if v_mode not in ('NONE','MASKED','FULL') then raise exception 'invalid_reveal_mode' using errcode='22023'; end if;
  if p_shared_track_id is null then v_mode := 'NONE'; end if;
  if p_shared_track_id is not null and not exists(select 1 from public.tracks where id=p_shared_track_id) then
    raise exception 'track_not_found' using errcode='P0002';
  end if;

  if p_target_profile_id is not null then
    if p_target_profile_id=v_uid then raise exception 'cannot_message_self' using errcode='22023'; end if;
    if not exists(select 1 from public.profiles where id=p_target_profile_id and is_public=true) then
      raise exception 'target_unavailable' using errcode='P0002';
    end if;
    if exists(
      select 1 from public.user_blocks b
      where (b.blocker_id=v_uid and b.blocked_id=p_target_profile_id)
         or (b.blocker_id=p_target_profile_id and b.blocked_id=v_uid)
    ) then raise exception 'blocked_relationship' using errcode='42501'; end if;
  end if;

  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 minute')>=4 then
    raise exception 'rate_limited' using errcode='57014';
  end if;
  if (select count(*) from public.music_agora_messages m where m.profile_id=v_uid and m.created_at>now()-interval '1 hour')>=30 then
    raise exception 'rate_limited' using errcode='57014';
  end if;

  insert into public.music_agora_messages(
    room_slug,profile_id,body,target_profile_id,shared_track_id,music_reveal_mode
  ) values(
    p_room_slug,v_uid,coalesce(nullif(v_body,''),'♫ Partage musical'),p_target_profile_id,p_shared_track_id,v_mode
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.keep_agora_post_message_v2(text,text,uuid,uuid,text) from public,anon;
grant execute on function public.keep_agora_post_message_v2(text,text,uuid,uuid,text) to authenticated;
