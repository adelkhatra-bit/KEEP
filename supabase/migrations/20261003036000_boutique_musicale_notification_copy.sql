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
        '◆ Boutique musicale · nouvelle Pépite',
        '@'||coalesce(nullif(v_seller_username,''),'Loki')||
          ' vient d’ajouter une Pépite dans sa Boutique musicale, sélectionnée selon tes goûts. Écoute l’aperçu avant de choisir.',
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


update public.notifications
set
  title = '◆ Boutique musicale · nouvelle Pépite',
  body = regexp_replace(
    body,
    'vient de publier une Pépite liée à tes écoutes\. Lance les aperçus avant de choisir\.',
    'vient d’ajouter une Pépite dans sa Boutique musicale, sélectionnée selon tes goûts. Écoute l’aperçu avant de choisir.'
  )
where type='PLAYLIST_SALE_OFFER_CREATED'
  and (title='◆ Nouveau Drop du moment' or body ilike '%Drop du moment%' or body ilike '%liée à tes écoutes%');
