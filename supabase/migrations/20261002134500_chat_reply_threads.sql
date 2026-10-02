-- WhatsApp-style quoted replies for Loki chat.
-- Keeps the existing posting/payment logic intact by wrapping the current RPCs.

alter table public.music_agora_messages
  add column if not exists reply_to_message_id bigint null
  references public.music_agora_messages(id) on delete set null;

alter table public.music_agora_group_messages
  add column if not exists reply_to_message_id bigint null
  references public.music_agora_group_messages(id) on delete set null;

create index if not exists music_agora_messages_reply_to_idx
  on public.music_agora_messages(reply_to_message_id)
  where reply_to_message_id is not null;

create index if not exists music_agora_group_messages_reply_to_idx
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
  v_parent public.music_agora_messages%rowtype;
  v_result jsonb;
  v_message_id bigint;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_reply_to_message_id is not null then
    select * into v_parent
    from public.music_agora_messages
    where id=p_reply_to_message_id
      and moderation_status='VISIBLE';

    if not found then
      raise exception 'reply_message_not_found' using errcode='P0002';
    end if;

    if v_parent.room_slug is distinct from p_room_slug then
      raise exception 'reply_message_wrong_room' using errcode='22023';
    end if;

    if p_target_profile_id is null then
      if v_parent.target_profile_id is not null then
        raise exception 'reply_message_not_public' using errcode='22023';
      end if;
    else
      if not (
        (v_parent.profile_id=v_uid and v_parent.target_profile_id=p_target_profile_id)
        or (v_parent.profile_id=p_target_profile_id and v_parent.target_profile_id=v_uid)
        or (v_parent.profile_id=p_target_profile_id and v_parent.target_profile_id is null)
      ) then
        raise exception 'reply_message_wrong_conversation' using errcode='22023';
      end if;
    end if;
  end if;

  v_result := public.keep_agora_post_message_v4(
    p_room_slug,
    p_body,
    p_target_profile_id,
    p_shared_track_id,
    p_reveal_mode,
    p_payment_mode,
    p_free_price,
    p_price_cents,
    p_currency_code
  );

  v_message_id := coalesce(
    nullif(v_result->>'messageId','')::bigint,
    nullif(v_result->>'message_id','')::bigint
  );

  if p_reply_to_message_id is not null and v_message_id is not null then
    update public.music_agora_messages
    set reply_to_message_id=p_reply_to_message_id
    where id=v_message_id and profile_id=v_uid;
  end if;

  return v_result || jsonb_build_object('replyToMessageId',p_reply_to_message_id);
end;
$function$;

revoke all on function public.keep_agora_post_message_v5(text,text,uuid,uuid,text,text,integer,integer,text,bigint) from public;
grant execute on function public.keep_agora_post_message_v5(text,text,uuid,uuid,text,text,integer,integer,text,bigint) to authenticated;

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
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_reply_to_message_id is not null and not exists(
    select 1
    from public.music_agora_group_messages m
    where m.id=p_reply_to_message_id
      and m.group_id=p_group_id
  ) then
    raise exception 'reply_message_wrong_conversation' using errcode='22023';
  end if;

  v_id := public.keep_agora_post_group_message(
    p_group_id,
    p_body,
    p_shared_track_id,
    p_reveal_mode
  );

  if p_reply_to_message_id is not null then
    update public.music_agora_group_messages
    set reply_to_message_id=p_reply_to_message_id
    where id=v_id and profile_id=v_uid;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.keep_agora_post_group_message_v2(uuid,text,uuid,text,bigint) from public;
grant execute on function public.keep_agora_post_group_message_v2(uuid,text,uuid,text,bigint) to authenticated;

create or replace function public.keep_agora_messages_v6(
  p_room_slug text,
  p_before_id bigint default null,
  p_limit integer default 24
)
returns table(
  id bigint,
  room_slug text,
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  body text,
  created_at timestamptz,
  target_profile_id uuid,
  target_username text,
  shared_track_id uuid,
  music_reveal_mode text,
  track_title text,
  track_artist text,
  track_artwork_url text,
  track_preview_url text,
  sale_offer_id uuid,
  payment_mode text,
  free_price integer,
  price_cents integer,
  currency_code text,
  offer_active boolean,
  viewer_unlocked boolean,
  viewer_payment_id uuid,
  viewer_payment_status text,
  viewer_marked_paid boolean,
  target_owns_track boolean,
  viewer_owns_track boolean,
  sender_can_resell boolean,
  discovered_by_username text,
  reply_to_message_id bigint,
  reply_to_profile_id uuid,
  reply_to_username text,
  reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    b.id,b.room_slug,b.profile_id,b.username,b.avatar_url,b.kind,b.body,b.created_at,
    b.target_profile_id,b.target_username,b.shared_track_id,b.music_reveal_mode,
    b.track_title,b.track_artist,b.track_artwork_url,b.track_preview_url,
    b.sale_offer_id,b.payment_mode,b.free_price,b.price_cents,b.currency_code,b.offer_active,
    b.viewer_unlocked,b.viewer_payment_id,b.viewer_payment_status,b.viewer_marked_paid,
    b.target_owns_track,b.viewer_owns_track,b.sender_can_resell,b.discovered_by_username,
    m.reply_to_message_id,
    parent.profile_id,
    parent_profile.username,
    parent.body
  from public.keep_agora_messages_v5(p_room_slug,p_before_id,p_limit) b
  join public.music_agora_messages m on m.id=b.id
  left join public.music_agora_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles parent_profile on parent_profile.id=parent.profile_id;
$function$;

revoke all on function public.keep_agora_messages_v6(text,bigint,integer) from public;
grant execute on function public.keep_agora_messages_v6(text,bigint,integer) to anon, authenticated;

create or replace function public.keep_agora_direct_messages_v2(
  p_other_profile_id uuid,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,
  room_slug text,
  profile_id uuid,
  username text,
  avatar_url text,
  kind text,
  body text,
  created_at timestamptz,
  target_profile_id uuid,
  target_username text,
  shared_track_id uuid,
  music_reveal_mode text,
  track_title text,
  track_artist text,
  track_artwork_url text,
  track_preview_url text,
  sale_offer_id uuid,
  payment_mode text,
  free_price integer,
  price_cents integer,
  currency_code text,
  offer_active boolean,
  viewer_unlocked boolean,
  viewer_payment_id uuid,
  viewer_payment_status text,
  viewer_marked_paid boolean,
  target_owns_track boolean,
  viewer_owns_track boolean,
  sender_can_resell boolean,
  discovered_by_username text,
  reply_to_message_id bigint,
  reply_to_profile_id uuid,
  reply_to_username text,
  reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    b.id,b.room_slug,b.profile_id,b.username,b.avatar_url,b.kind,b.body,b.created_at,
    b.target_profile_id,b.target_username,b.shared_track_id,b.music_reveal_mode,
    b.track_title,b.track_artist,b.track_artwork_url,b.track_preview_url,
    b.sale_offer_id,b.payment_mode,b.free_price,b.price_cents,b.currency_code,b.offer_active,
    b.viewer_unlocked,b.viewer_payment_id,b.viewer_payment_status,b.viewer_marked_paid,
    b.target_owns_track,b.viewer_owns_track,b.sender_can_resell,b.discovered_by_username,
    m.reply_to_message_id,
    parent.profile_id,
    parent_profile.username,
    parent.body
  from public.keep_agora_direct_messages_v1(p_other_profile_id,p_before_id,p_limit) b
  join public.music_agora_messages m on m.id=b.id
  left join public.music_agora_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles parent_profile on parent_profile.id=parent.profile_id;
$function$;

revoke all on function public.keep_agora_direct_messages_v2(uuid,bigint,integer) from public;
grant execute on function public.keep_agora_direct_messages_v2(uuid,bigint,integer) to authenticated;

create or replace function public.keep_agora_group_messages_v2(
  p_group_id uuid,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table(
  id bigint,
  profile_id uuid,
  username text,
  avatar_url text,
  body text,
  created_at timestamptz,
  shared_track_id uuid,
  music_reveal_mode text,
  track_title text,
  track_artist text,
  track_artwork_url text,
  track_preview_url text,
  reply_to_message_id bigint,
  reply_to_profile_id uuid,
  reply_to_username text,
  reply_to_body text
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  select
    b.id,b.profile_id,b.username,b.avatar_url,b.body,b.created_at,
    b.shared_track_id,b.music_reveal_mode,b.track_title,b.track_artist,b.track_artwork_url,b.track_preview_url,
    m.reply_to_message_id,
    parent.profile_id,
    parent_profile.username,
    parent.body
  from public.keep_agora_group_messages(p_group_id,p_before_id,p_limit) b
  join public.music_agora_group_messages m on m.id=b.id
  left join public.music_agora_group_messages parent on parent.id=m.reply_to_message_id
  left join public.profiles parent_profile on parent_profile.id=parent.profile_id;
$function$;

revoke all on function public.keep_agora_group_messages_v2(uuid,bigint,integer) from public;
grant execute on function public.keep_agora_group_messages_v2(uuid,bigint,integer) to authenticated;
