-- Parrainage musical des Pépites.
-- Objectif : aucune "pub" générique. Un Drop n'est diffusé qu'aux profils
-- ayant déjà une relation avec le vendeur (abonné, reprise, like) ET un
-- style musical compatible avec la collection.
-- La diffusion est asynchrone et batchée pour rester viable à grande échelle.

create table if not exists public.playlist_sale_notification_fanout_jobs (
  offer_id uuid primary key references public.playlist_sale_offers(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  audience_cutoff timestamptz not null default now(),
  last_recipient_id uuid,
  scanned_count bigint not null default 0 check (scanned_count >= 0),
  notified_count bigint not null default 0 check (notified_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_sale_notification_sends (
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (offer_id, recipient_id)
);

create index if not exists playlist_sale_notification_fanout_pending_idx
  on public.playlist_sale_notification_fanout_jobs(completed_at, created_at)
  where completed_at is null;

create index if not exists keep_decisions_source_profile_created_idx
  on public.keep_decisions(source_user_id, profile_id, created_at)
  where source_user_id is not null and decision in ('KEEP','KEPT');

create index if not exists track_likes_track_profile_created_idx
  on public.track_likes(track_id, profile_id, created_at);

alter table public.playlist_sale_notification_fanout_jobs enable row level security;
alter table public.playlist_sale_notification_sends enable row level security;

revoke all on public.playlist_sale_notification_fanout_jobs from public, anon, authenticated;
revoke all on public.playlist_sale_notification_sends from public, anon, authenticated;
grant select, insert, update, delete on public.playlist_sale_notification_fanout_jobs to service_role;
grant select, insert, update, delete on public.playlist_sale_notification_sends to service_role;

create or replace function public.keep_enqueue_playlist_sale_fanout(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.playlist_sale_offers%rowtype;
begin
  select * into v_offer
  from public.playlist_sale_offers
  where id = p_offer_id;

  if not found or not v_offer.is_active or v_offer.target_buyer_id is not null then
    return;
  end if;

  insert into public.playlist_sale_notification_fanout_jobs(
    offer_id, seller_id, audience_cutoff
  )
  values (v_offer.id, v_offer.seller_id, now())
  on conflict (offer_id) do nothing;
end;
$$;

revoke all on function public.keep_enqueue_playlist_sale_fanout(uuid) from public, anon, authenticated;
grant execute on function public.keep_enqueue_playlist_sale_fanout(uuid) to service_role;

-- Compatibilité : tous les anciens RPC qui appellent cette fonction continuent
-- de fonctionner, mais ils n'envoient plus des milliers de notifications
-- dans la transaction utilisateur. Ils déposent seulement un job.
create or replace function public.keep_playlist_sale_notify_followers(
  p_seller_id uuid,
  p_offer_id uuid,
  p_playlist_name text,
  p_price_cents integer,
  p_currency_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.keep_enqueue_playlist_sale_fanout(p_offer_id);
end;
$$;

revoke all on function public.keep_playlist_sale_notify_followers(uuid,uuid,text,integer,text) from public, anon;
grant execute on function public.keep_playlist_sale_notify_followers(uuid,uuid,text,integer,text) to authenticated, service_role;

create or replace function public.keep_enqueue_playlist_sale_fanout_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and new.target_buyer_id is null then
    perform public.keep_enqueue_playlist_sale_fanout(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_playlist_sale_fanout_enqueue on public.playlist_sale_offers;
create trigger trg_playlist_sale_fanout_enqueue
after insert on public.playlist_sale_offers
for each row execute function public.keep_enqueue_playlist_sale_fanout_trigger();

-- L'ancien trigger FREE envoyait directement à tous les "prior keepers".
-- Il est remplacé par le même pipeline ciblé/batché pour tous les modes.
drop trigger if exists trg_keep_playlist_sale_free_prior_keepers_notify on public.playlist_sale_offers;

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
  p_jobs := greatest(1, least(coalesce(p_jobs,12), 50));
  p_scan_batch := greatest(100, least(coalesce(p_scan_batch,1500), 5000));

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
    where id = v_job.offer_id;

    if not found or not v_offer.is_active or v_offer.target_buyer_id is not null then
      update public.playlist_sale_notification_fanout_jobs
      set completed_at=now(), updated_at=now(), attempt_count=attempt_count+1
      where offer_id=v_job.offer_id;
      continue;
    end if;

    select username into v_seller_username
    from public.profiles
    where id=v_offer.seller_id;

    with offer_genres as materialized (
      select distinct lower(trim(g.genre)) genre
      from public.playlist_sale_offer_tracks ot
      join public.tracks t on t.id::text=ot.track_id::text
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
        and kd.decision in ('KEEP','KEPT')
        and kd.profile_id<>v_offer.seller_id
        and kd.created_at<=v_job.audience_cutoff

      union

      select tl.profile_id recipient_id
      from public.keep_decisions seller_kd
      join public.track_likes tl on tl.track_id::text=seller_kd.track_id::text
      where seller_kd.profile_id=v_offer.seller_id
        and seller_kd.decision in ('KEEP','KEPT')
        and tl.profile_id<>v_offer.seller_id
        and tl.created_at<=v_job.audience_cutoff
    ),
    candidate_page as materialized (
      select r.recipient_id
      from related r
      where (v_job.last_recipient_id is null or r.recipient_id>v_job.last_recipient_id)
      order by r.recipient_id
      limit p_scan_batch
    ),
    eligible as materialized (
      select cp.recipient_id
      from candidate_page cp
      left join public.notification_preferences np on np.profile_id=cp.recipient_id
      where coalesce(np.social_enabled,true)=true
        and exists (
          select 1
          from offer_genres og
          where
            exists (
              select 1
              from public.profiles vp
              cross join lateral unnest(
                coalesce(vp.favorite_genres,'{}'::text[]) ||
                coalesce(vp.inferred_genres,'{}'::text[])
              ) vg(genre)
              where vp.id=cp.recipient_id
                and lower(trim(vg.genre))=og.genre
            )
            or exists (
              select 1
              from public.keep_decisions vkd
              join public.tracks vt on vt.id::text=vkd.track_id::text
              cross join lateral unnest(coalesce(vt.genres,'{}'::text[])) vg(genre)
              where vkd.profile_id=cp.recipient_id
                and vkd.decision in ('KEEP','KEPT')
                and lower(trim(vg.genre))=og.genre
            )
            or exists (
              select 1
              from public.track_likes vtl
              join public.tracks vt on vt.id::text=vtl.track_id::text
              cross join lateral unnest(coalesce(vt.genres,'{}'::text[])) vg(genre)
              where vtl.profile_id=cp.recipient_id
                and lower(trim(vg.genre))=og.genre
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
        '◆ Drop du moment · pour ton style',
        '@'||coalesce(nullif(v_seller_username,''),'Loki')||
          ' vient de publier une Pépite qui correspond à tes écoutes. Écoute les aperçus avant de choisir.',
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

    v_total := v_total + coalesce(v_sent,0);

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

revoke all on function public.keep_process_playlist_sale_notification_fanout(integer,integer) from public, anon, authenticated;
grant execute on function public.keep_process_playlist_sale_notification_fanout(integer,integer) to service_role;

do $$
declare v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname='loki-playlist-sale-targeted-fanout'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'loki-playlist-sale-targeted-fanout',
  '* * * * *',
  'select public.keep_process_playlist_sale_notification_fanout(12,1500);'
);

-- Recommandations visibles "Drop du moment" : même logique.
-- Pas de vendeur aléatoire si aucun lien social/musical.
drop function if exists public.keep_profile_sale_suggestions(integer);
create function public.keep_profile_sale_suggestions(p_limit integer default 8)
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
  currency_code char(3),
  match_score integer
)
language sql
stable
security definer
set search_path=public,auth
as $$
with viewer_genres as (
  select distinct lower(trim(g)) genre
  from (
    select unnest(
      coalesce(p.favorite_genres,'{}'::text[]) ||
      coalesce(p.inferred_genres,'{}'::text[])
    ) g
    from public.profiles p
    where p.id=auth.uid()

    union all

    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.keep_decisions kd
    join public.tracks t on t.id::text=kd.track_id::text
    where kd.profile_id=auth.uid()
      and kd.decision in ('KEEP','KEPT')

    union all

    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.track_likes tl
    join public.tracks t on t.id::text=tl.track_id::text
    where tl.profile_id=auth.uid()
  ) x
  where nullif(trim(g),'') is not null
),
active_sellers as (
  select distinct o.seller_id
  from public.playlist_sale_offers o
  where o.is_active=true
    and o.seller_id<>auth.uid()
    and (o.target_buyer_id is null or o.target_buyer_id=auth.uid())
),
related_sellers as (
  select f.followee_id seller_id,35 social_score
  from public.follows f
  join active_sellers a on a.seller_id=f.followee_id
  where f.follower_id=auth.uid()

  union all

  select kd.source_user_id seller_id,45 social_score
  from public.keep_decisions kd
  join active_sellers a on a.seller_id=kd.source_user_id
  where kd.profile_id=auth.uid()
    and kd.decision in ('KEEP','KEPT')
    and kd.source_user_id is not null

  union all

  select skd.profile_id seller_id,40 social_score
  from public.track_likes tl
  join public.keep_decisions skd on skd.track_id::text=tl.track_id::text
  join active_sellers a on a.seller_id=skd.profile_id
  where tl.profile_id=auth.uid()
    and skd.decision in ('KEEP','KEPT')
),
affinity as (
  select seller_id,max(social_score)::integer social_score
  from related_sellers
  group by seller_id
),
offers as (
  select
    o.id offer_id,
    o.seller_id,
    p.username seller_username,
    p.avatar_url seller_avatar_url,
    o.playlist_name,
    count(distinct ot.track_id)::integer track_count,
    coalesce(array_agg(distinct trim(g.genre)) filter(where nullif(trim(g.genre),'') is not null),'{}'::text[]) genres,
    o.payment_mode,
    o.price_cents,
    o.free_price,
    o.currency_code,
    (count(distinct vg.genre)*20+a.social_score)::integer match_score,
    count(distinct vg.genre)::integer genre_match_count,
    o.updated_at
  from public.playlist_sale_offers o
  join affinity a on a.seller_id=o.seller_id
  join public.profiles p on p.id=o.seller_id and p.is_public=true
  join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
  join public.tracks t on t.id::text=ot.track_id::text
  left join lateral (
    select unnest(coalesce(t.genres,'{}'::text[])) genre
  ) g on true
  left join viewer_genres vg on vg.genre=lower(trim(g.genre))
  where o.is_active=true
    and o.seller_id<>auth.uid()
    and (o.target_buyer_id is null or o.target_buyer_id=auth.uid())
    and not exists (
      select 1
      from public.playlist_sale_payments pay
      where pay.offer_id=o.id
        and pay.buyer_id=auth.uid()
        and pay.status='COMPLETED'
    )
  group by
    o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,
    o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
),
ranked as (
  select o.*,
    row_number() over (
      partition by o.seller_id
      order by o.match_score desc,o.updated_at desc
    ) seller_rank
  from offers o
  where o.genre_match_count>0
)
select
  o.offer_id,
  o.seller_id,
  o.seller_username,
  o.seller_avatar_url,
  o.playlist_name,
  o.track_count,
  coalesce((x.overlap->>'ownedCount')::integer,0) owned_count,
  coalesce((x.overlap->>'missingCount')::integer,o.track_count) missing_count,
  o.genres,
  o.payment_mode,
  o.price_cents,
  o.free_price,
  o.currency_code,
  o.match_score
from ranked o
cross join lateral (
  select public.keep_playlist_sale_offer_overlap(o.offer_id) overlap
) x
where o.seller_rank<=2
order by o.match_score desc,o.updated_at desc
limit greatest(1,least(coalesce(p_limit,8),20));
$$;

revoke all on function public.keep_profile_sale_suggestions(integer) from public;
grant execute on function public.keep_profile_sale_suggestions(integer) to authenticated;
