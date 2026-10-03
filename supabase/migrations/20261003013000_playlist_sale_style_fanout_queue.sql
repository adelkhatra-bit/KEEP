-- Loki Music: diffusion scalable des Pépites.
-- Publication immédiate = 1 job. Les destinataires sont traités ensuite par lots.
-- Audience = abonnés + personnes ayant déjà gardé un morceau venant du vendeur,
-- filtrée par compatibilité de style quand Loki connaît leurs goûts.

create table if not exists public.playlist_sale_notification_fanout_jobs (
  offer_id uuid primary key references public.playlist_sale_offers(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  audience_cutoff timestamptz not null default now(),
  last_profile_id uuid,
  processed_count bigint not null default 0 check (processed_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_sale_notification_sends (
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (offer_id, profile_id)
);

create index if not exists playlist_sale_notification_fanout_pending_idx
  on public.playlist_sale_notification_fanout_jobs(completed_at, created_at)
  where completed_at is null;

alter table public.playlist_sale_notification_fanout_jobs enable row level security;
alter table public.playlist_sale_notification_sends enable row level security;
revoke all on table public.playlist_sale_notification_fanout_jobs from public, anon, authenticated;
revoke all on table public.playlist_sale_notification_sends from public, anon, authenticated;
grant select, insert, update, delete on table public.playlist_sale_notification_fanout_jobs to service_role;
grant select, insert, update, delete on table public.playlist_sale_notification_sends to service_role;

create or replace function public.keep_enqueue_playlist_sale_notification_fanout(
  p_seller_id uuid,
  p_offer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_seller_id is null or p_offer_id is null then return; end if;

  insert into public.playlist_sale_notification_fanout_jobs(
    offer_id,seller_id,audience_cutoff,last_profile_id,
    processed_count,attempt_count,completed_at,updated_at
  )
  values(p_offer_id,p_seller_id,now(),null,0,0,null,now())
  on conflict (offer_id) do update
  set seller_id = excluded.seller_id,
      audience_cutoff = excluded.audience_cutoff,
      last_profile_id = null,
      processed_count = 0,
      attempt_count = 0,
      completed_at = null,
      updated_at = now();
end;
$$;

revoke all on function public.keep_enqueue_playlist_sale_notification_fanout(uuid,uuid) from public, anon, authenticated;
grant execute on function public.keep_enqueue_playlist_sale_notification_fanout(uuid,uuid) to service_role;

create or replace function public.keep_process_playlist_sale_notification_fanout(
  p_jobs integer default 20,
  p_batch integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.playlist_sale_notification_fanout_jobs%rowtype;
  v_seller_username text;
  v_playlist_name text;
  v_payment_mode text;
  v_price_cents integer;
  v_free_price integer;
  v_currency_code text;
  v_track_count integer;
  v_offer_genres text[];
  v_recipient_count integer;
  v_notification_count integer;
  v_last_profile uuid;
  v_total integer := 0;
begin
  p_jobs := greatest(1, least(coalesce(p_jobs,20),100));
  p_batch := greatest(100, least(coalesce(p_batch,1000),5000));

  for v_job in
    select j.*
    from public.playlist_sale_notification_fanout_jobs j
    where j.completed_at is null
    order by j.created_at asc
    limit p_jobs
    for update skip locked
  loop
    select
      p.username,
      o.playlist_name,
      o.payment_mode,
      o.price_cents,
      o.free_price,
      o.currency_code::text,
      count(distinct ot.track_id)::integer,
      coalesce(array_agg(distinct lower(trim(g.genre)))
        filter(where nullif(trim(g.genre),'') is not null),'{}'::text[])
    into
      v_seller_username,
      v_playlist_name,
      v_payment_mode,
      v_price_cents,
      v_free_price,
      v_currency_code,
      v_track_count,
      v_offer_genres
    from public.playlist_sale_offers o
    join public.profiles p on p.id=o.seller_id and p.is_public=true
    left join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
    left join public.tracks t on t.id=ot.track_id
    left join lateral(select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true
    where o.id=v_job.offer_id
      and o.seller_id=v_job.seller_id
      and o.is_active=true
      and o.target_buyer_id is null
    group by o.id,p.username,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code;

    if v_playlist_name is null then
      update public.playlist_sale_notification_fanout_jobs
      set completed_at=now(),updated_at=now(),attempt_count=attempt_count+1
      where offer_id=v_job.offer_id;
      continue;
    end if;

    with related as materialized (
      select f.follower_id profile_id
      from public.follows f
      where f.followee_id=v_job.seller_id
        and f.created_at <= v_job.audience_cutoff
      union
      select kd.profile_id
      from public.keep_decisions kd
      where kd.source_user_id=v_job.seller_id
        and kd.profile_id<>v_job.seller_id
        and kd.decision in ('KEEP','KEPT')
        and kd.created_at <= v_job.audience_cutoff
    ),
    recipients as materialized (
      select r.profile_id
      from related r
      join public.profiles rp on rp.id=r.profile_id
      left join public.notification_preferences np on np.profile_id=r.profile_id
      where r.profile_id<>v_job.seller_id
        and (v_job.last_profile_id is null or r.profile_id>v_job.last_profile_id)
        and coalesce(np.social_enabled,true)=true
        and not exists (
          select 1
          from public.playlist_sale_payments pay
          where pay.offer_id=v_job.offer_id
            and pay.buyer_id=r.profile_id
            and pay.status='COMPLETED'
        )
        and (
          cardinality(v_offer_genres)=0
          or not (
            exists (
              select 1
              from unnest(coalesce(rp.favorite_genres,'{}'::text[])) rg
              where nullif(trim(rg),'') is not null
            )
            or exists (
              select 1
              from public.keep_decisions rkd
              join public.tracks rt on rt.id=rkd.track_id
              cross join lateral unnest(coalesce(rt.genres,'{}'::text[])) rg
              where rkd.profile_id=r.profile_id
                and rkd.decision in ('KEEP','KEPT')
                and nullif(trim(rg),'') is not null
            )
          )
          or exists (
            select 1
            from unnest(coalesce(rp.favorite_genres,'{}'::text[])) rg
            where lower(trim(rg))=any(v_offer_genres)
          )
          or exists (
            select 1
            from public.keep_decisions rkd
            join public.tracks rt on rt.id=rkd.track_id
            cross join lateral unnest(coalesce(rt.genres,'{}'::text[])) rg
            where rkd.profile_id=r.profile_id
              and rkd.decision in ('KEEP','KEPT')
              and lower(trim(rg))=any(v_offer_genres)
          )
        )
      order by r.profile_id
      limit p_batch
    ),
    new_sends as (
      insert into public.playlist_sale_notification_sends(offer_id,profile_id)
      select v_job.offer_id,r.profile_id
      from recipients r
      on conflict do nothing
      returning profile_id
    ),
    created_notifications as (
      insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
      select
        s.profile_id,
        case when upper(coalesce(v_payment_mode,'MONEY'))='FREE'
          then 'PLAYLIST_SALE_NEW_OFFER'
          else 'PLAYLIST_SALE_OFFER_CREATED'
        end,
        '◆ Nouvelle Pépite de @'||coalesce(nullif(v_seller_username,''),'Loki'),
        case when upper(coalesce(v_payment_mode,'MONEY'))='FREE'
          then coalesce(v_track_count,0)||' titres · '||coalesce(v_free_price,0)||' FREE · écoute les aperçus avant de choisir.'
          else coalesce(v_track_count,0)||' titres · écoute les aperçus avant de choisir.'
        end,
        jsonb_build_object(
          'event',case when upper(coalesce(v_payment_mode,'MONEY'))='FREE'
            then 'PLAYLIST_SALE_NEW_OFFER' else 'PLAYLIST_SALE_OFFER_CREATED' end,
          'offerId',v_job.offer_id,
          'sellerId',v_job.seller_id,
          'sellerUsername',v_seller_username,
          'paymentMode',upper(coalesce(v_payment_mode,'MONEY')),
          'freePrice',v_free_price,
          'priceCents',v_price_cents,
          'currencyCode',upper(coalesce(v_currency_code,'EUR')),
          'trackCount',coalesce(v_track_count,0),
          'genres',to_jsonb(coalesce(v_offer_genres,'{}'::text[])),
          'masked',true,
          'source','STYLE_AFFINITY_FANOUT'
        ),
        'CREATED',
        0
      from new_sends s
      returning profile_id
    )
    select
      (select count(*)::integer from recipients),
      (select max(profile_id) from recipients),
      (select count(*)::integer from created_notifications)
    into v_recipient_count,v_last_profile,v_notification_count;

    v_total := v_total + coalesce(v_notification_count,0);

    update public.playlist_sale_notification_fanout_jobs
    set last_profile_id=coalesce(v_last_profile,last_profile_id),
        processed_count=processed_count+coalesce(v_recipient_count,0),
        attempt_count=attempt_count+1,
        completed_at=case when coalesce(v_recipient_count,0)<p_batch then now() else null end,
        updated_at=now()
    where offer_id=v_job.offer_id;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.keep_process_playlist_sale_notification_fanout(integer,integer) from public, anon, authenticated;
grant execute on function public.keep_process_playlist_sale_notification_fanout(integer,integer) to service_role;

-- Ancien helper MONEY : désormais il met seulement le job en file.
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
  perform public.keep_enqueue_playlist_sale_notification_fanout(p_seller_id,p_offer_id);
end;
$$;

create or replace function public.keep_playlist_sale_set_offer_for_selection_v6(
  p_track_ids uuid[],
  p_name text,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null,
  p_currency_code text default 'EUR',
  p_cover_url text default null,
  p_allow_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  access jsonb;
  clean_name text := coalesce(nullif(trim(p_name),''),'Sélection Loki');
  clean_mode text := upper(coalesce(nullif(trim(p_payment_mode),''),'MONEY'));
  clean_currency text := upper(coalesce(nullif(trim(p_currency_code),''),'EUR'));
  clean_cover text := nullif(trim(coalesce(p_cover_url,'')),'');
  clean_money integer := coalesce(p_price_cents,0);
  clean_free integer := p_free_price;
  new_offer_id uuid := gen_random_uuid();
  clean_ids uuid[];
  conflict_track_ids uuid[] := array[]::uuid[];
  row_result public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_ids is null or array_length(p_track_ids,1) is null then raise exception 'TRACK_SELECTION_REQUIRED'; end if;
  if array_length(p_track_ids,1)>200 then raise exception 'TRACK_SELECTION_TOO_LARGE'; end if;
  if clean_mode not in ('MONEY','FREE') then raise exception 'PAYMENT_MODE_INVALID'; end if;

  if clean_mode='MONEY' then
    if clean_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_free := null;
  else
    if clean_free is null or clean_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_money := 0;
  end if;

  if length(clean_name)>100 then raise exception 'PLAYLIST_NAME_TOO_LONG'; end if;
  if clean_cover is not null and clean_cover !~* '^https://' then raise exception 'COVER_URL_MUST_BE_HTTPS'; end if;

  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then raise exception 'PLAYLIST_SALE_LOCKED:%',(access->>'threshold'); end if;

  select coalesce(array_agg(distinct candidate.track_id),array[]::uuid[])
  into clean_ids
  from (
    select pt.track_id
    from public.playlist_tracks pt
    join public.playlists pl on pl.id=pt.playlist_id
    where pl.owner_id=uid and pt.track_id=any(p_track_ids)
    union
    select kd.track_id
    from public.keep_decisions kd
    where kd.profile_id=uid and kd.decision='KEPT' and kd.track_id=any(p_track_ids)
  ) candidate
  where not exists (
    select 1 from public.keep_decisions kd2
    where kd2.profile_id=uid
      and kd2.track_id=candidate.track_id
      and kd2.decision='KEPT'
      and kd2.source_user_id is not null
  );

  if array_length(clean_ids,1) is null
     or array_length(clean_ids,1) <> array_length((select array_agg(distinct x) from unnest(p_track_ids) x),1)
  then
    raise exception 'TRACK_SELECTION_NOT_OWNED';
  end if;
  if cardinality(clean_ids)<2 then raise exception 'COLLECTION_MIN_TWO_TRACKS'; end if;

  select coalesce(array_agg(distinct ot.track_id),array[]::uuid[])
  into conflict_track_ids
  from public.playlist_sale_offer_tracks ot
  join public.playlist_sale_offers o on o.id=ot.offer_id
  where o.seller_id=uid
    and o.is_active=true
    and ot.track_id=any(clean_ids);

  if cardinality(conflict_track_ids)>0 and not p_allow_existing then
    raise exception 'TRACK_ALREADY_IN_ACTIVE_OFFER:%',cardinality(conflict_track_ids);
  end if;

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,cover_url,payment_mode,free_price
  )
  values(
    new_offer_id,uid,'keep-selection:'||new_offer_id::text,clean_name,clean_money,clean_currency,clean_cover,clean_mode,clean_free
  )
  returning * into row_result;

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  select new_offer_id,t from unnest(clean_ids) t;

  perform public.keep_enqueue_playlist_sale_notification_fanout(uid,new_offer_id);

  return jsonb_build_object(
    'id',row_result.id,
    'offerId',row_result.id,
    'playlistId',row_result.playlist_id,
    'playlistName',row_result.playlist_name,
    'paymentMode',row_result.payment_mode,
    'priceCents',row_result.price_cents,
    'freePrice',row_result.free_price,
    'currencyCode',row_result.currency_code,
    'trackCount',array_length(clean_ids,1),
    'reusedTrackCount',cardinality(conflict_track_ids)
  );
end;
$$;

revoke all on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) from public, anon;
grant execute on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) to authenticated;

-- Compatibilité binaire : les versions déjà installées qui appellent v5
-- bénéficient immédiatement de la nouvelle file scalable.
create or replace function public.keep_playlist_sale_set_offer_for_selection_v5(
  p_track_ids uuid[],
  p_name text,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null,
  p_currency_code text default 'EUR',
  p_cover_url text default null,
  p_allow_existing boolean default false
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select public.keep_playlist_sale_set_offer_for_selection_v6(
    p_track_ids,p_name,p_payment_mode,p_price_cents,p_free_price,
    p_currency_code,p_cover_url,p_allow_existing
  );
$$;

revoke all on function public.keep_playlist_sale_set_offer_for_selection_v5(uuid[],text,text,integer,integer,text,text,boolean) from public, anon;
grant execute on function public.keep_playlist_sale_set_offer_for_selection_v5(uuid[],text,text,integer,integer,text,text,boolean) to authenticated;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='loki-playlist-sale-fanout'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'loki-playlist-sale-fanout',
  '* * * * *',
  'select public.keep_process_playlist_sale_notification_fanout(20,1000);'
);
