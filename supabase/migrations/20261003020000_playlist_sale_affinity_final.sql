-- Source de vérité finale pour les Drops Loki :
-- 1) audience = abonnement / reprise / like d'un morceau dont le vendeur est le premier découvreur
-- 2) style compatible obligatoire lorsque les goûts des deux côtés sont connus
-- 3) aucun calcul massif côté téléphone
-- 4) fanout asynchrone par lots pour monter en charge

create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(
  offer_id uuid,
  seller_id uuid,
  seller_username text,
  seller_avatar_url text,
  playlist_name text,
  track_count integer,
  owned_count integer,
  missing_count integer,
  genres text[],
  payment_mode text,
  price_cents integer,
  free_price integer,
  currency_code character,
  match_score integer
)
language sql
stable
security definer
set search_path = public, auth
as $$
with
viewer as (
  select auth.uid() as uid,
         greatest(1, least(coalesce(p_limit,8),20)) as limit_n
),
viewer_genres as (
  select distinct lower(trim(g)) genre
  from (
    select unnest(coalesce(p.favorite_genres,'{}'::text[]) || coalesce(p.inferred_genres,'{}'::text[])) g
    from public.profiles p
    join viewer v on v.uid=p.id

    union all

    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.keep_decisions kd
    join viewer v on v.uid=kd.profile_id
    join public.tracks t on t.id=kd.track_id
    where kd.decision='KEPT'

    union all

    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.track_likes tl
    join viewer v on v.uid=tl.profile_id
    join public.tracks t on t.id=tl.track_id
  ) x
  where nullif(trim(g),'') is not null
),
viewer_genre_count as (
  select count(*)::integer n from viewer_genres
),
social_signals as (
  select f.followee_id seller_id, 70 follow_score, 0 like_score, 0 reprise_score
  from public.follows f
  join viewer v on v.uid=f.follower_id

  union all

  select fd.profile_id seller_id, 0, 55, 0
  from public.track_likes tl
  join viewer v on v.uid=tl.profile_id
  join public.keep_track_first_discoveries fd on fd.track_id=tl.track_id
  where fd.profile_id<>v.uid

  union all

  select kd.source_user_id seller_id, 0, 0, 85
  from public.keep_decisions kd
  join viewer v on v.uid=kd.profile_id
  where kd.decision='KEPT'
    and kd.source_user_id is not null
    and kd.source_user_id<>v.uid
),
candidate_sellers as (
  select seller_id,
         max(follow_score)+max(like_score)+max(reprise_score) social_score
  from social_signals
  where seller_id is not null
  group by seller_id
),
offer_agg as (
  select
    o.id offer_id,
    o.seller_id,
    p.username seller_username,
    p.avatar_url seller_avatar_url,
    o.playlist_name,
    count(distinct ot.track_id)::integer track_count,
    coalesce(
      array_agg(distinct lower(trim(g.genre)))
        filter(where nullif(trim(g.genre),'') is not null),
      '{}'::text[]
    ) genres,
    o.payment_mode,
    o.price_cents,
    o.free_price,
    o.currency_code,
    o.updated_at,
    cs.social_score,
    count(distinct vg.genre) filter(where vg.genre is not null)::integer genre_overlap
  from candidate_sellers cs
  join viewer v on true
  join public.playlist_sale_offers o
    on o.seller_id=cs.seller_id
   and o.is_active=true
   and o.target_buyer_id is null
   and o.seller_id<>v.uid
  join public.profiles p
    on p.id=o.seller_id
   and p.is_public=true
   and coalesce(p.discovery_hidden,false)=false
  join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
  join public.tracks t on t.id=ot.track_id
  left join lateral (
    select unnest(coalesce(t.genres,'{}'::text[])) genre
  ) g on true
  left join viewer_genres vg
    on vg.genre=lower(trim(g.genre))
    or (
      length(vg.genre)>=4
      and length(lower(trim(g.genre)))>=4
      and (
        position(vg.genre in lower(trim(g.genre)))>0
        or position(lower(trim(g.genre)) in vg.genre)>0
      )
    )
  where not exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id=v.uid and b.blocked_id=o.seller_id)
       or (b.blocker_id=o.seller_id and b.blocked_id=v.uid)
  )
    and not exists (
      select 1
      from public.playlist_sale_payments pay
      where pay.offer_id=o.id
        and pay.buyer_id=v.uid
        and pay.status='COMPLETED'
    )
  group by
    o.id,o.seller_id,p.username,p.avatar_url,o.playlist_name,
    o.payment_mode,o.price_cents,o.free_price,o.currency_code,
    o.updated_at,cs.social_score
),
scored as (
  select
    oa.*,
    (oa.social_score + oa.genre_overlap*30)::integer final_score,
    row_number() over (
      partition by oa.seller_id
      order by (oa.social_score + oa.genre_overlap*30) desc, oa.updated_at desc
    ) seller_rank
  from offer_agg oa
  cross join viewer_genre_count vgc
  where oa.track_count>0
    and (
      vgc.n=0
      or cardinality(oa.genres)=0
      or oa.genre_overlap>0
    )
),
picked as (
  select s.*
  from scored s
  where s.seller_rank<=2
  order by s.final_score desc,s.updated_at desc
  limit (select limit_n from viewer)
)
select
  p.offer_id,
  p.seller_id,
  p.seller_username,
  p.seller_avatar_url,
  p.playlist_name,
  p.track_count,
  coalesce((x.overlap->>'ownedCount')::integer,0) owned_count,
  coalesce((x.overlap->>'missingCount')::integer,p.track_count) missing_count,
  p.genres,
  p.payment_mode,
  p.price_cents,
  p.free_price,
  p.currency_code,
  p.final_score match_score
from picked p
cross join lateral (
  select public.keep_playlist_sale_offer_overlap(p.offer_id) overlap
) x
order by p.final_score desc,p.updated_at desc;
$$;

revoke all on function public.keep_profile_sale_suggestions(integer) from public, anon;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;


create or replace function public.keep_process_playlist_sale_notification_fanout(
  p_jobs integer default 12,
  p_scan_batch integer default 1500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.playlist_sale_notification_fanout_jobs%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_seller_username text;
  v_scanned integer;
  v_sent integer;
  v_last uuid;
  v_total integer := 0;
begin
  p_jobs := greatest(1,least(coalesce(p_jobs,12),50));
  p_scan_batch := greatest(100,least(coalesce(p_scan_batch,1500),5000));

  for v_job in
    select j.*
    from public.playlist_sale_notification_fanout_jobs j
    where j.completed_at is null
    order by j.created_at asc
    limit p_jobs
    for update skip locked
  loop
    select * into v_offer
    from public.playlist_sale_offers
    where id=v_job.offer_id;

    if not found or not v_offer.is_active or v_offer.target_buyer_id is not null then
      update public.playlist_sale_notification_fanout_jobs
      set completed_at=now(),updated_at=now(),attempt_count=attempt_count+1
      where offer_id=v_job.offer_id;
      continue;
    end if;

    select username into v_seller_username
    from public.profiles
    where id=v_offer.seller_id;

    with offer_genres as materialized (
      select distinct lower(trim(g.genre)) genre
      from public.playlist_sale_offer_tracks ot
      join public.tracks t on t.id=ot.track_id
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where ot.offer_id=v_offer.id
        and nullif(trim(g.genre),'') is not null
    ),
    related as materialized (
      select f.follower_id recipient_id
      from public.follows f
      where f.followee_id=v_offer.seller_id
        and f.created_at<=v_job.audience_cutoff

      union

      select kd.profile_id recipient_id
      from public.keep_decisions kd
      where kd.source_user_id=v_offer.seller_id
        and kd.decision='KEPT'
        and kd.profile_id<>v_offer.seller_id
        and kd.created_at<=v_job.audience_cutoff

      union

      select tl.profile_id recipient_id
      from public.track_likes tl
      join public.keep_track_first_discoveries fd on fd.track_id=tl.track_id
      where fd.profile_id=v_offer.seller_id
        and tl.profile_id<>v_offer.seller_id
        and tl.created_at<=v_job.audience_cutoff
    ),
    candidate_page as materialized (
      select r.recipient_id
      from related r
      where v_job.last_recipient_id is null or r.recipient_id>v_job.last_recipient_id
      order by r.recipient_id
      limit p_scan_batch
    ),
    viewer_genres as materialized (
      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.profiles vp on vp.id=cp.recipient_id
      cross join lateral unnest(
        coalesce(vp.favorite_genres,'{}'::text[]) ||
        coalesce(vp.inferred_genres,'{}'::text[])
      ) g(genre)
      where nullif(trim(g.genre),'') is not null

      union

      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.keep_decisions kd
        on kd.profile_id=cp.recipient_id
       and kd.decision='KEPT'
      join public.tracks t on t.id=kd.track_id
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where nullif(trim(g.genre),'') is not null

      union

      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.track_likes tl on tl.profile_id=cp.recipient_id
      join public.tracks t on t.id=tl.track_id
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where nullif(trim(g.genre),'') is not null
    ),
    eligible as materialized (
      select cp.recipient_id
      from candidate_page cp
      left join public.notification_preferences np on np.profile_id=cp.recipient_id
      where coalesce(np.social_enabled,true)=true
        and not exists (
          select 1
          from public.user_blocks b
          where (b.blocker_id=cp.recipient_id and b.blocked_id=v_offer.seller_id)
             or (b.blocker_id=v_offer.seller_id and b.blocked_id=cp.recipient_id)
        )
        and (
          not exists(select 1 from offer_genres)
          or not exists(
            select 1 from viewer_genres vg where vg.recipient_id=cp.recipient_id
          )
          or exists (
            select 1
            from offer_genres og
            join viewer_genres vg on vg.recipient_id=cp.recipient_id
            where vg.genre=og.genre
               or (
                 length(vg.genre)>=4
                 and length(og.genre)>=4
                 and (
                   position(vg.genre in og.genre)>0
                   or position(og.genre in vg.genre)>0
                 )
               )
          )
        )
    ),
    new_sends as (
      insert into public.playlist_sale_notification_sends(offer_id,recipient_id)
      select v_offer.id,e.recipient_id
      from eligible e
      on conflict do nothing
      returning recipient_id
    ),
    created_notifications as (
      insert into public.notifications(
        profile_id,type,title,body,data,push_delivery_status,push_attempt_count
      )
      select
        s.recipient_id,
        'PLAYLIST_SALE_OFFER_CREATED',
        '◆ Nouveau Drop du moment',
        '@'||coalesce(nullif(v_seller_username,''),'Loki')||
          ' vient de publier une Pépite liée à tes écoutes. Lance les aperçus avant de choisir.',
        jsonb_build_object(
          'event','PLAYLIST_SALE_OFFER_CREATED',
          'offerId',v_offer.id,
          'sellerId',v_offer.seller_id,
          'sellerUsername',v_seller_username,
          'playlistName',v_offer.playlist_name,
          'paymentMode',v_offer.payment_mode,
          'priceCents',v_offer.price_cents,
          'freePrice',v_offer.free_price,
          'currencyCode',v_offer.currency_code,
          'targetedByMusicTaste',true
        ),
        'pending',
        0
      from new_sends s
      returning profile_id
    )
    select
      (select count(*)::integer from candidate_page),
      (select max(recipient_id) from candidate_page),
      (select count(*)::integer from created_notifications)
    into v_scanned,v_last,v_sent;

    v_total:=v_total+coalesce(v_sent,0);

    update public.playlist_sale_notification_fanout_jobs
    set
      last_recipient_id=coalesce(v_last,last_recipient_id),
      scanned_count=scanned_count+coalesce(v_scanned,0),
      notified_count=notified_count+coalesce(v_sent,0),
      attempt_count=attempt_count+1,
      completed_at=case when coalesce(v_scanned,0)<p_scan_batch then now() else null end,
      updated_at=now()
    where offer_id=v_job.offer_id;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.keep_process_playlist_sale_notification_fanout(integer,integer)
  from public,anon,authenticated;
grant execute on function public.keep_process_playlist_sale_notification_fanout(integer,integer)
  to service_role;
