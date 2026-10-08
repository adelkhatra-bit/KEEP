-- Loki Messenger: realtime direct conversations + WhatsApp-style message replies.
-- Non-destructive: existing messages remain valid; reply metadata is optional.

alter table public.music_agora_messages
  add column if not exists reply_to_message_id bigint
  references public.music_agora_messages(id) on delete set null;

alter table public.music_agora_group_messages
  add column if not exists reply_to_message_id bigint
  references public.music_agora_group_messages(id) on delete set null;

create index if not exists idx_music_agora_messages_reply_to
  on public.music_agora_messages(reply_to_message_id)
  where reply_to_message_id is not null;

create index if not exists idx_music_agora_group_messages_reply_to
  on public.music_agora_group_messages(reply_to_message_id)
  where reply_to_message_id is not null;

create or replace function public.keep_agora_post_message_v5(
  p_room_slug text,
  p_body text default '',
  p_target_profile_id uuid default null,
  p_shared_track_id uuid default null,
  p_reveal_mode text default 'NONE',
  p_payment_mode text default 'NONE',
  p_free_price integer default null,
  p_price_cents integer default null,
  p_currency_code text default 'EUR',
  p_reply_to_message_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_message_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  if p_reply_to_message_id is not null then
    if p_target_profile_id is null then
      if not exists(
        select 1
        from public.music_agora_messages parent
        where parent.id=p_reply_to_message_id
          and parent.room_slug=p_room_slug
          and parent.target_profile_id is null
          and parent.moderation_status='VISIBLE'
      ) then
        raise exception 'reply_message_unavailable' using errcode='P0002';
      end if;
    else
      if not exists(
        select 1
        from public.music_agora_messages parent
        where parent.id=p_reply_to_message_id
          and parent.target_profile_id is not null
          and parent.moderation_status='VISIBLE'
          and (
            (parent.profile_id=v_uid and parent.target_profile_id=p_target_profile_id)
            or
            (parent.profile_id=p_target_profile_id and parent.target_profile_id=v_uid)
          )
      ) then
        raise exception 'reply_message_unavailable' using errcode='P0002';
      end if;
    end if;
  end if;

  v_result := public.keep_agora_post_message_v4(
    p_room_slug,p_body,p_target_profile_id,p_shared_track_id,p_reveal_mode,
    p_payment_mode,p_free_price,p_price_cents,p_currency_code
  );
  v_message_id := nullif(v_result->>'messageId','')::bigint;

  if v_message_id is not null and p_reply_to_message_id is not null then
    update public.music_agora_messages
    set reply_to_message_id=p_reply_to_message_id
    where id=v_message_id and profile_id=v_uid;
  end if;

  return v_result || jsonb_build_object('replyToMessageId',p_reply_to_message_id);
end;
$function$;

revoke all on function public.keep_agora_post_message_v5(text,text,uuid,uuid,text,text,integer,integer,text,bigint) from public,anon;
grant execute on function public.keep_agora_post_message_v5(text,text,uuid,uuid,text,text,integer,integer,text,bigint) to authenticated;

create or replace function public.keep_agora_messages_v6(
  p_room_slug text,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,room_slug text,profile_id uuid,username text,avatar_url text,kind text,body text,created_at timestamptz,
  target_profile_id uuid,target_username text,shared_track_id uuid,music_reveal_mode text,
  track_title text,track_artist text,track_artwork_url text,track_preview_url text,
  sale_offer_id uuid,payment_mode text,free_price integer,price_cents integer,currency_code text,
  offer_active boolean,viewer_unlocked boolean,viewer_payment_id uuid,viewer_payment_status text,
  viewer_marked_paid boolean,target_owns_track boolean,viewer_owns_track boolean,sender_can_resell boolean,
  discovered_by_username text,
  reply_to_message_id bigint,reply_to_username text,reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    q.id,q.room_slug,q.profile_id,q.username,q.avatar_url,q.kind,q.body,q.created_at,
    q.target_profile_id,q.target_username,q.shared_track_id,q.music_reveal_mode,
    q.track_title,q.track_artist,q.track_artwork_url,q.track_preview_url,
    q.sale_offer_id,q.payment_mode,q.free_price,q.price_cents,q.currency_code,
    q.offer_active,q.viewer_unlocked,q.viewer_payment_id,q.viewer_payment_status,
    q.viewer_marked_paid,q.target_owns_track,q.viewer_owns_track,q.sender_can_resell,
    q.discovered_by_username,
    m.reply_to_message_id,
    rp.username,
    case when parent.id is null then null else left(parent.body,240) end
  from public.keep_agora_messages_v5(p_room_slug,p_before_id,p_limit) q
  join public.music_agora_messages m on m.id=q.id
  left join public.music_agora_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles rp on rp.id=parent.profile_id
$function$;

revoke all on function public.keep_agora_messages_v6(text,bigint,integer) from public,anon;
grant execute on function public.keep_agora_messages_v6(text,bigint,integer) to authenticated;

create or replace function public.keep_agora_direct_messages_v2(
  p_other_profile_id uuid,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,room_slug text,profile_id uuid,username text,avatar_url text,kind text,body text,created_at timestamptz,
  target_profile_id uuid,target_username text,shared_track_id uuid,music_reveal_mode text,
  track_title text,track_artist text,track_artwork_url text,track_preview_url text,
  sale_offer_id uuid,payment_mode text,free_price integer,price_cents integer,currency_code text,
  offer_active boolean,viewer_unlocked boolean,viewer_payment_id uuid,viewer_payment_status text,
  viewer_marked_paid boolean,target_owns_track boolean,viewer_owns_track boolean,sender_can_resell boolean,
  discovered_by_username text,
  reply_to_message_id bigint,reply_to_username text,reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    q.id,q.room_slug,q.profile_id,q.username,q.avatar_url,q.kind,q.body,q.created_at,
    q.target_profile_id,q.target_username,q.shared_track_id,q.music_reveal_mode,
    q.track_title,q.track_artist,q.track_artwork_url,q.track_preview_url,
    q.sale_offer_id,q.payment_mode,q.free_price,q.price_cents,q.currency_code,
    q.offer_active,q.viewer_unlocked,q.viewer_payment_id,q.viewer_payment_status,
    q.viewer_marked_paid,q.target_owns_track,q.viewer_owns_track,q.sender_can_resell,
    q.discovered_by_username,
    m.reply_to_message_id,
    rp.username,
    case when parent.id is null then null else left(parent.body,240) end
  from public.keep_agora_direct_messages_v1(p_other_profile_id,p_before_id,p_limit) q
  join public.music_agora_messages m on m.id=q.id
  left join public.music_agora_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles rp on rp.id=parent.profile_id
$function$;

revoke all on function public.keep_agora_direct_messages_v2(uuid,bigint,integer) from public,anon;
grant execute on function public.keep_agora_direct_messages_v2(uuid,bigint,integer) to authenticated;

create or replace function public.keep_agora_post_group_message_v2(
  p_group_id uuid,
  p_body text default '',
  p_shared_track_id uuid default null,
  p_reveal_mode text default 'NONE',
  p_reply_to_message_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  if p_reply_to_message_id is not null and not exists(
    select 1
    from public.music_agora_group_messages parent
    where parent.id=p_reply_to_message_id and parent.group_id=p_group_id
  ) then
    raise exception 'reply_message_unavailable' using errcode='P0002';
  end if;

  v_id := public.keep_agora_post_group_message(
    p_group_id,p_body,p_shared_track_id,p_reveal_mode
  );

  if p_reply_to_message_id is not null then
    update public.music_agora_group_messages
    set reply_to_message_id=p_reply_to_message_id
    where id=v_id and profile_id=v_uid and group_id=p_group_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.keep_agora_post_group_message_v2(uuid,text,uuid,text,bigint) from public,anon;
grant execute on function public.keep_agora_post_group_message_v2(uuid,text,uuid,text,bigint) to authenticated;

create or replace function public.keep_agora_group_messages_v2(
  p_group_id uuid,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,profile_id uuid,username text,avatar_url text,body text,created_at timestamptz,
  shared_track_id uuid,music_reveal_mode text,track_title text,track_artist text,
  track_artwork_url text,track_preview_url text,
  reply_to_message_id bigint,reply_to_username text,reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    q.id,q.profile_id,q.username,q.avatar_url,q.body,q.created_at,
    q.shared_track_id,q.music_reveal_mode,q.track_title,q.track_artist,
    q.track_artwork_url,q.track_preview_url,
    m.reply_to_message_id,
    rp.username,
    case when parent.id is null then null else left(parent.body,240) end
  from public.keep_agora_group_messages(p_group_id,p_before_id,p_limit) q
  join public.music_agora_group_messages m on m.id=q.id
  left join public.music_agora_group_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles rp on rp.id=parent.profile_id
$function$;

revoke all on function public.keep_agora_group_messages_v2(uuid,bigint,integer) from public,anon;
grant execute on function public.keep_agora_group_messages_v2(uuid,bigint,integer) to authenticated;
