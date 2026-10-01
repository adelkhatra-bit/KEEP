-- Direct-first Loki Messenger.
-- Keeps the public music rooms, but gives the floating chat a real private inbox.

create or replace function public.keep_agora_my_conversations(p_limit integer default 30)
returns table(
  other_profile_id uuid,
  other_username text,
  other_avatar_url text,
  last_message_id bigint,
  last_room_slug text,
  last_body text,
  last_created_at timestamptz,
  last_shared_track_id uuid,
  last_sale_offer_id uuid
)
language sql
stable
security definer
set search_path=public,auth
as $function$
  with me as (select auth.uid() uid),
  direct as (
    select
      case when m.profile_id=me.uid then m.target_profile_id else m.profile_id end other_id,
      m.id,m.room_slug,m.body,m.created_at,m.shared_track_id,m.sale_offer_id
    from public.music_agora_messages m
    cross join me
    where me.uid is not null
      and m.target_profile_id is not null
      and m.moderation_status='VISIBLE'
      and (m.profile_id=me.uid or m.target_profile_id=me.uid)
      and not exists(
        select 1 from public.user_blocks b
        where (b.blocker_id=me.uid and b.blocked_id=case when m.profile_id=me.uid then m.target_profile_id else m.profile_id end)
           or (b.blocked_id=me.uid and b.blocker_id=case when m.profile_id=me.uid then m.target_profile_id else m.profile_id end)
      )
  ),
  ranked as (
    select d.*,row_number() over(partition by d.other_id order by d.id desc) rn
    from direct d
    where d.other_id is not null
  )
  select
    r.other_id,p.username,p.avatar_url,
    r.id,r.room_slug,r.body,r.created_at,r.shared_track_id,r.sale_offer_id
  from ranked r
  join public.profiles p on p.id=r.other_id
  where r.rn=1
  order by r.id desc
  limit greatest(1,least(coalesce(p_limit,30),60));
$function$;

revoke all on function public.keep_agora_my_conversations(integer) from public,anon;
grant execute on function public.keep_agora_my_conversations(integer) to authenticated;

create or replace function public.keep_agora_direct_messages_v1(
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
  discovered_by_username text
)
language plpgsql
stable
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,30),50));
begin
  if v_uid is null or p_other_profile_id is null then return; end if;
  if exists(
    select 1 from public.user_blocks b
    where (b.blocker_id=v_uid and b.blocked_id=p_other_profile_id)
       or (b.blocker_id=p_other_profile_id and b.blocked_id=v_uid)
  ) then return; end if;

  return query
  select
    m.id,m.room_slug,m.profile_id,p.username,p.avatar_url,p.kind::text,m.body,m.created_at,
    m.target_profile_id,tp.username,m.shared_track_id,m.music_reveal_mode,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.title else null end,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.artist else null end,
    case
      when (m.sale_offer_id is null and m.music_reveal_mode='FULL')
        or (m.sale_offer_id is not null and (m.profile_id=v_uid or vp.status='COMPLETED'))
      then t.artwork_url else null end,
    t.preview_url,
    m.sale_offer_id,o.payment_mode,o.free_price,o.price_cents,trim(o.currency_code)::text,o.is_active,
    coalesce(vp.status='COMPLETED',false),vp.id,vp.status,vp.buyer_marked_paid_at is not null,
    case when m.target_profile_id is not null and m.shared_track_id is not null
      then public.keep_profile_has_track(m.target_profile_id,m.shared_track_id) else false end,
    case when m.shared_track_id is not null
      then public.keep_profile_has_track(v_uid,m.shared_track_id) else false end,
    case when m.shared_track_id is not null
      then public.keep_profile_can_resell_track(m.profile_id,m.shared_track_id) else false end,
    case when m.shared_track_id is not null then coalesce(srcp.username,p.username) else null end
  from public.music_agora_messages m
  join public.profiles p on p.id=m.profile_id
  left join public.profiles tp on tp.id=m.target_profile_id
  left join public.tracks t on t.id=m.shared_track_id
  left join public.playlist_sale_offers o on o.id=m.sale_offer_id
  left join lateral (
    select pay.id,pay.status,pay.buyer_marked_paid_at
    from public.playlist_sale_payments pay
    where pay.offer_id=m.sale_offer_id and pay.buyer_id=v_uid
    order by pay.created_at desc limit 1
  ) vp on true
  left join lateral (
    select kd.source_user_id
    from public.keep_decisions kd
    where kd.profile_id=m.profile_id and kd.track_id=m.shared_track_id and kd.decision='KEPT'
    order by kd.created_at desc limit 1
  ) src on true
  left join public.profiles srcp on srcp.id=src.source_user_id
  where m.moderation_status='VISIBLE'
    and m.target_profile_id is not null
    and (
      (m.profile_id=v_uid and m.target_profile_id=p_other_profile_id)
      or (m.profile_id=p_other_profile_id and m.target_profile_id=v_uid)
    )
    and (p_before_id is null or m.id<p_before_id)
  order by m.id desc
  limit v_limit;
end;
$function$;

revoke all on function public.keep_agora_direct_messages_v1(uuid,bigint,integer) from public,anon;
grant execute on function public.keep_agora_direct_messages_v1(uuid,bigint,integer) to authenticated;
