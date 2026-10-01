-- Tchat music ownership contract:
-- 1) a track acquired from another profile may be shared/listened to but never resold;
-- 2) both sides of a direct chat can see when the recipient already owns the track;
-- 3) discovery attribution stays visible without revealing masked title/artist.

create or replace function public.keep_profile_has_track(p_profile_id uuid, p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  select coalesce(
    exists(
      select 1
      from public.keep_decisions kd
      where kd.profile_id=p_profile_id
        and kd.track_id=p_track_id
        and kd.decision='KEPT'
    )
    or exists(
      select 1
      from public.playlist_tracks pt
      join public.playlists pl on pl.id=pt.playlist_id
      where pl.owner_id=p_profile_id
        and pt.track_id=p_track_id
    ),
    false
  );
$function$;

revoke all on function public.keep_profile_has_track(uuid,uuid) from public,anon;
grant execute on function public.keep_profile_has_track(uuid,uuid) to authenticated,service_role;

create or replace function public.keep_profile_can_resell_track(p_profile_id uuid, p_track_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $function$
  select coalesce(exists(
    select 1
    from public.keep_decisions kd
    where kd.profile_id=p_profile_id
      and kd.track_id=p_track_id
      and kd.decision='KEPT'
      and kd.source_user_id is null
      and coalesce(kd.context->>'source','') not in (
        'marketplace_purchase',
        'public_profile',
        'public_profile_swipe',
        'agora_purchase',
        'chat_purchase'
      )
  ),false);
$function$;

revoke all on function public.keep_profile_can_resell_track(uuid,uuid) from public,anon;
grant execute on function public.keep_profile_can_resell_track(uuid,uuid) to authenticated,service_role;

create or replace function public.keep_agora_my_track_sale_eligibility(p_track_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  uid uuid := auth.uid();
  v_source_id uuid;
  v_source_username text;
  v_has boolean := false;
  v_can_sell boolean := false;
begin
  if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  v_has := public.keep_profile_has_track(uid,p_track_id);
  v_can_sell := public.keep_profile_can_resell_track(uid,p_track_id);

  select kd.source_user_id
    into v_source_id
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.track_id=p_track_id
    and kd.decision='KEPT'
  order by kd.created_at desc
  limit 1;

  if v_source_id is not null then
    select p.username into v_source_username from public.profiles p where p.id=v_source_id;
  end if;

  return jsonb_build_object(
    'hasTrack',v_has,
    'canSell',v_can_sell,
    'sourceProfileId',v_source_id,
    'sourceUsername',v_source_username,
    'reason',case
      when not v_has then 'TRACK_NOT_IN_YOUR_MUSIC'
      when not v_can_sell then 'ACQUIRED_FROM_ANOTHER_USER'
      else 'OWN_DISCOVERY'
    end
  );
end;
$function$;

revoke all on function public.keep_agora_my_track_sale_eligibility(uuid) from public,anon;
grant execute on function public.keep_agora_my_track_sale_eligibility(uuid) to authenticated;

create or replace function public.keep_chat_sale_offer_track_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_seller uuid;
  v_name text;
begin
  select o.seller_id,o.playlist_name into v_seller,v_name
  from public.playlist_sale_offers o
  where o.id=new.offer_id;

  if v_seller is not null
     and coalesce(v_name,'') like 'Pépite Tchat · %'
     and not public.keep_profile_can_resell_track(v_seller,new.track_id)
  then
    raise exception 'CHAT_TRACK_RESALE_FORBIDDEN' using errcode='42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_keep_chat_sale_offer_track_guard on public.playlist_sale_offer_tracks;
create trigger trg_keep_chat_sale_offer_track_guard
before insert or update of track_id on public.playlist_sale_offer_tracks
for each row execute function public.keep_chat_sale_offer_track_guard();

create or replace function public.keep_agora_messages_v5(
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
  discovered_by_username text
)
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,24),40));
begin
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then
    return;
  end if;

  return query
  select
    m.id,m.room_slug,m.profile_id,p.username,p.avatar_url,p.kind::text,m.body,m.created_at,
    m.target_profile_id,tp.username,m.shared_track_id,m.music_reveal_mode,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and v_uid is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.title else null
    end,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and v_uid is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.artist else null
    end,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and v_uid is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.artwork_url else null
    end,
    t.preview_url,
    m.sale_offer_id,o.payment_mode,o.free_price,o.price_cents,trim(o.currency_code)::text,o.is_active,
    coalesce(vp.status='COMPLETED',false),
    vp.id,
    vp.status,
    vp.buyer_marked_paid_at is not null,
    case when m.target_profile_id is not null and m.shared_track_id is not null
      then public.keep_profile_has_track(m.target_profile_id,m.shared_track_id)
      else false end,
    case when v_uid is not null and m.shared_track_id is not null
      then public.keep_profile_has_track(v_uid,m.shared_track_id)
      else false end,
    case when m.shared_track_id is not null
      then public.keep_profile_can_resell_track(m.profile_id,m.shared_track_id)
      else false end,
    case when m.shared_track_id is not null
      then coalesce(srcp.username,p.username)
      else null end
  from public.music_agora_messages m
  join public.profiles p on p.id=m.profile_id and p.is_public=true
  left join public.profiles tp on tp.id=m.target_profile_id
  left join public.tracks t on t.id=m.shared_track_id
  left join public.playlist_sale_offers o on o.id=m.sale_offer_id
  left join lateral (
    select pay.id,pay.status,pay.buyer_marked_paid_at
    from public.playlist_sale_payments pay
    where pay.offer_id=m.sale_offer_id
      and v_uid is not null
      and pay.buyer_id=v_uid
    order by pay.created_at desc
    limit 1
  ) vp on true
  left join lateral (
    select kd.source_user_id
    from public.keep_decisions kd
    where kd.profile_id=m.profile_id
      and kd.track_id=m.shared_track_id
      and kd.decision='KEPT'
    order by kd.created_at desc
    limit 1
  ) src on true
  left join public.profiles srcp on srcp.id=src.source_user_id
  where m.room_slug=p_room_slug
    and m.moderation_status='VISIBLE'
    and (p_before_id is null or m.id<p_before_id)
    and (
      m.target_profile_id is null
      or (v_uid is not null and (m.target_profile_id=v_uid or m.profile_id=v_uid))
    )
    and (
      v_uid is null
      or not exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=v_uid and b.blocked_id=m.profile_id)
           or (b.blocker_id=m.profile_id and b.blocked_id=v_uid)
      )
    )
  order by m.id desc
  limit v_limit;
end;
$function$;

revoke all on function public.keep_agora_messages_v5(text,bigint,integer) from public,anon;
grant execute on function public.keep_agora_messages_v5(text,bigint,integer) to authenticated;
