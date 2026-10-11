-- KEEP / Loki Music — achats marketplace : anti-doublon, demandes partielles et accès aux achats.
-- Additif uniquement. Aucun reset, aucune suppression de données utilisateur.

create table if not exists public.playlist_sale_track_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.playlist_sale_offers(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  requested_track_ids uuid[] not null,
  missing_count integer not null check (missing_count > 0),
  status text not null default 'PENDING' check (status in ('PENDING','OFFERED','DECLINED')),
  response_offer_id uuid references public.playlist_sale_offers(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists playlist_sale_track_requests_one_pending
  on public.playlist_sale_track_requests(offer_id,buyer_id)
  where status='PENDING';

create index if not exists playlist_sale_track_requests_seller_status
  on public.playlist_sale_track_requests(seller_id,status,created_at desc);

create index if not exists playlist_sale_track_requests_buyer_status
  on public.playlist_sale_track_requests(buyer_id,status,created_at desc);

alter table public.playlist_sale_track_requests enable row level security;

drop policy if exists playlist_sale_track_requests_read_own on public.playlist_sale_track_requests;
create policy playlist_sale_track_requests_read_own
on public.playlist_sale_track_requests
for select to authenticated
using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

revoke insert, update, delete on public.playlist_sale_track_requests from anon, authenticated;

create or replace function public.keep_playlist_sale_track_is_owned(p_profile_id uuid, p_track_id uuid)
returns boolean
language sql stable security definer
set search_path=public
as $$
  select
    exists (select 1 from public.keep_decisions kd where kd.profile_id=p_profile_id and kd.track_id=p_track_id and kd.decision='KEPT')
    or exists (
      select 1 from public.playlist_tracks pt
      join public.playlists pl on pl.id=pt.playlist_id
      where pl.owner_id=p_profile_id and pt.track_id=p_track_id
    )
    or exists (
      select 1 from public.music_library_items ml
      where ml.profile_id=p_profile_id and ml.track_id=p_track_id and ml.removed_at is null
    );
$$;
revoke all on function public.keep_playlist_sale_track_is_owned(uuid,uuid) from public, anon, authenticated;

create or replace function public.keep_playlist_sale_offer_overlap(p_offer_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_ids uuid[];
  v_total integer := 0;
  v_owned integer := 0;
begin
  select * into v_offer from public.playlist_sale_offers where id=p_offer_id and is_active=true;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  v_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  v_total := coalesce(cardinality(v_ids),0);
  if uid is not null and v_total > 0 then
    select count(*)::integer into v_owned
    from unnest(v_ids) t(track_id)
    where public.keep_playlist_sale_track_is_owned(uid,t.track_id);
  end if;
  return jsonb_build_object('totalCount',v_total,'ownedCount',v_owned,'missingCount',greatest(v_total-v_owned,0));
end;
$$;
grant execute on function public.keep_playlist_sale_offer_overlap(uuid) to anon, authenticated;

create or replace function public.keep_playlist_sale_offer_preview_tracks_v2(p_offer_id uuid)
returns table(track_id uuid, preview_url text, already_owned boolean)
language plpgsql stable security definer
set search_path=public,auth
as $$
declare uid uuid := auth.uid();
begin
  return query
  select t.id,t.preview_url,
    case when uid is null then false else public.keep_playlist_sale_track_is_owned(uid,t.id) end
  from public.playlist_sale_offer_tracks pst
  join public.playlist_sale_offers pso on pso.id=pst.offer_id
  join public.tracks t on t.id=pst.track_id
  where pso.id=p_offer_id and pso.is_active=true and t.preview_url is not null and t.preview_url<>''
  order by random();
end;
$$;
grant execute on function public.keep_playlist_sale_offer_preview_tracks_v2(uuid) to anon, authenticated;

create or replace function public.keep_playlist_sale_request_missing_tracks(p_offer_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_ids uuid[];
  v_missing uuid[];
  v_existing public.playlist_sale_track_requests%rowtype;
  v_request public.playlist_sale_track_requests%rowtype;
  v_buyer_username text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_offer from public.playlist_sale_offers where id=p_offer_id and is_active=true;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id=uid then raise exception 'CANNOT_REQUEST_OWN_PLAYLIST'; end if;

  v_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  select coalesce(array_agg(t.track_id),array[]::uuid[]) into v_missing
  from unnest(v_ids) t(track_id)
  where not public.keep_playlist_sale_track_is_owned(uid,t.track_id);
  if cardinality(v_missing)=0 then raise exception 'ALL_TRACKS_ALREADY_OWNED'; end if;

  select * into v_existing
  from public.playlist_sale_track_requests
  where offer_id=p_offer_id and buyer_id=uid and status='PENDING'
  order by created_at desc limit 1;

  if v_existing.id is not null then
    return jsonb_build_object('requestId',v_existing.id,'offerId',p_offer_id,'missingCount',v_existing.missing_count,'totalCount',cardinality(v_ids),'status',v_existing.status);
  end if;

  insert into public.playlist_sale_track_requests(offer_id,seller_id,buyer_id,requested_track_ids,missing_count)
  values (p_offer_id,v_offer.seller_id,uid,v_missing,cardinality(v_missing))
  returning * into v_request;

  select username into v_buyer_username from public.profiles where id=uid;
  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values (
    v_offer.seller_id,'PLAYLIST_SALE_PARTIAL_REQUEST','🎧 Demande sur ta collection',
    coalesce('@'||v_buyer_username,'Un utilisateur')||' demande '||cardinality(v_missing)||' morceau'||case when cardinality(v_missing)>1 then 'x' else '' end||' manquant'||case when cardinality(v_missing)>1 then 's' else '' end||' de « '||v_offer.playlist_name||' » contre des FREE.',
    jsonb_build_object('event','PLAYLIST_SALE_PARTIAL_REQUEST','requestId',v_request.id,'offerId',p_offer_id,'buyerId',uid,'missingCount',cardinality(v_missing)),
    'CREATED',0
  );

  return jsonb_build_object('requestId',v_request.id,'offerId',p_offer_id,'missingCount',cardinality(v_missing),'totalCount',cardinality(v_ids),'status','PENDING');
end;
$$;
revoke all on function public.keep_playlist_sale_request_missing_tracks(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_request_missing_tracks(uuid) to authenticated;

create or replace function public.keep_playlist_sale_my_missing_requests()
returns table(request_id uuid,offer_id uuid,buyer_username text,playlist_name text,missing_count integer,created_at timestamptz)
language sql stable security definer
set search_path=public,auth
as $$
  select r.id,r.offer_id,b.username,o.playlist_name,r.missing_count,r.created_at
  from public.playlist_sale_track_requests r
  join public.profiles b on b.id=r.buyer_id
  join public.playlist_sale_offers o on o.id=r.offer_id
  where r.seller_id=auth.uid() and r.status='PENDING'
  order by r.created_at desc;
$$;
revoke all on function public.keep_playlist_sale_my_missing_requests() from public, anon;
grant execute on function public.keep_playlist_sale_my_missing_requests() to authenticated;

create or replace function public.keep_playlist_sale_offer_request_with_free(p_request_id uuid, p_free_price integer)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  v_request public.playlist_sale_track_requests%rowtype;
  v_original public.playlist_sale_offers%rowtype;
  v_ids uuid[];
  v_new_offer_id uuid := gen_random_uuid();
  v_seller_username text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_free_price not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;

  select * into v_request from public.playlist_sale_track_requests
  where id=p_request_id and seller_id=uid and status='PENDING' for update;
  if v_request.id is null then raise exception 'TRACK_REQUEST_NOT_FOUND_OR_CLOSED'; end if;

  select * into v_original from public.playlist_sale_offers where id=v_request.offer_id;
  if v_original.id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  select coalesce(array_agg(distinct r.track_id),array[]::uuid[]) into v_ids
  from unnest(v_request.requested_track_ids) r(track_id)
  join public.playlist_sale_offer_tracks pst on pst.offer_id=v_request.offer_id and pst.track_id=r.track_id;
  if cardinality(v_ids)=0 then raise exception 'REQUEST_HAS_NO_AVAILABLE_TRACKS'; end if;

  insert into public.playlist_sale_offers(id,seller_id,playlist_id,playlist_name,price_cents,currency_code,cover_url,payment_mode,free_price,is_active)
  values (v_new_offer_id,uid,'keep-request:'||v_new_offer_id::text,left(v_original.playlist_name||' · demande privée',100),0,'EUR',null,'FREE',p_free_price,true);

  insert into public.playlist_sale_offer_tracks(offer_id,track_id)
  select v_new_offer_id,t from unnest(v_ids) t;

  update public.playlist_sale_track_requests
  set status='OFFERED',response_offer_id=v_new_offer_id,responded_at=now()
  where id=v_request.id;

  select username into v_seller_username from public.profiles where id=uid;
  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values (
    v_request.buyer_id,'PLAYLIST_SALE_PARTIAL_OFFER','⚡ Offre perso reçue',
    coalesce('@'||v_seller_username,'Le créateur')||' te propose '||cardinality(v_ids)||' morceau'||case when cardinality(v_ids)>1 then 'x' else '' end||' manquant'||case when cardinality(v_ids)>1 then 's' else '' end||' pour '||p_free_price||' FREE.',
    jsonb_build_object('event','PLAYLIST_SALE_PARTIAL_OFFER','requestId',v_request.id,'offerId',v_new_offer_id,'sellerId',uid,'freePrice',p_free_price,'trackCount',cardinality(v_ids)),
    'CREATED',0
  );

  return jsonb_build_object('offerId',v_new_offer_id,'trackCount',cardinality(v_ids),'freePrice',p_free_price);
end;
$$;
revoke all on function public.keep_playlist_sale_offer_request_with_free(uuid,integer) from public, anon;
grant execute on function public.keep_playlist_sale_offer_request_with_free(uuid,integer) to authenticated;

create or replace function public.keep_playlist_sale_decline_track_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  v_request public.playlist_sale_track_requests%rowtype;
  v_seller_username text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_request from public.playlist_sale_track_requests
  where id=p_request_id and seller_id=uid and status='PENDING' for update;
  if v_request.id is null then raise exception 'TRACK_REQUEST_NOT_FOUND_OR_CLOSED'; end if;

  update public.playlist_sale_track_requests set status='DECLINED',responded_at=now() where id=v_request.id;
  select username into v_seller_username from public.profiles where id=uid;
  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values (
    v_request.buyer_id,'PLAYLIST_SALE_PARTIAL_DECLINED','Demande terminée',
    coalesce('@'||v_seller_username,'Le créateur')||' ne propose pas de déblocage séparé pour cette collection.',
    jsonb_build_object('event','PLAYLIST_SALE_PARTIAL_DECLINED','requestId',v_request.id,'offerId',v_request.offer_id),
    'CREATED',0
  );
end;
$$;
revoke all on function public.keep_playlist_sale_decline_track_request(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_decline_track_request(uuid) to authenticated;

create or replace function public.keep_playlist_sale_my_purchase_library(p_limit integer default 6)
returns table(payment_id uuid,offer_id uuid,seller_username text,playlist_name text,delivered_playlist_id uuid,track_count integer,payment_mode text,amount_cents integer,amount_free integer,currency_code text,delivered_at timestamptz)
language sql stable security definer
set search_path=public,auth
as $$
  select
    p.id,p.offer_id,s.username,o.playlist_name,p.delivered_playlist_id,
    (select count(*)::integer from public.playlist_tracks pt where pt.playlist_id=p.delivered_playlist_id),
    case when p.amount_free>0 or upper(p.provider)='FREE_CREDITS' then 'FREE' else 'MONEY' end,
    p.amount_cents,p.amount_free,p.currency_code::text,coalesce(p.delivered_at,p.created_at)
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id=p.offer_id
  join public.profiles s on s.id=p.seller_id
  where p.buyer_id=auth.uid() and p.status='COMPLETED' and p.delivered_playlist_id is not null
  order by coalesce(p.delivered_at,p.created_at) desc
  limit greatest(1,least(coalesce(p_limit,6),20));
$$;
revoke all on function public.keep_playlist_sale_my_purchase_library(integer) from public, anon;
grant execute on function public.keep_playlist_sale_my_purchase_library(integer) to authenticated;
