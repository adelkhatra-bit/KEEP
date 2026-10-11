-- Persistent buyer state for targeted music offers shown inside chat.
-- Keeps masked previews visible before payment, then reveals metadata after delivery.

create or replace function public.keep_agora_messages_v4(
  p_room_slug text,
  p_before_id bigint default null,
  p_limit integer default 24
)
returns table(
  id bigint,room_slug text,profile_id uuid,username text,avatar_url text,kind text,body text,created_at timestamptz,
  target_profile_id uuid,target_username text,shared_track_id uuid,music_reveal_mode text,
  track_title text,track_artist text,track_artwork_url text,track_preview_url text,
  sale_offer_id uuid,payment_mode text,free_price integer,price_cents integer,currency_code text,offer_active boolean,
  viewer_unlocked boolean,viewer_payment_id uuid,viewer_payment_status text,viewer_marked_paid boolean
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
  if not exists(select 1 from public.music_agora_rooms r where r.slug=p_room_slug and r.is_active=true) then return; end if;

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
    vp.buyer_marked_paid_at is not null
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

revoke all on function public.keep_agora_messages_v4(text,bigint,integer) from public;
grant execute on function public.keep_agora_messages_v4(text,bigint,integer) to anon,authenticated;
