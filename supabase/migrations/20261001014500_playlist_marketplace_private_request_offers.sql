-- Private buyer-targeted offers created from a missing-track request.
-- Follow-up to 20261001013000; additive and privacy-preserving.

alter table public.playlist_sale_offers
  add column if not exists target_buyer_id uuid references public.profiles(id) on delete cascade;

create index if not exists playlist_sale_offers_target_buyer
  on public.playlist_sale_offers(target_buyer_id,updated_at desc)
  where target_buyer_id is not null;

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

  select * into v_request
  from public.playlist_sale_track_requests
  where id=p_request_id and seller_id=uid and status='PENDING'
  for update;
  if v_request.id is null then raise exception 'TRACK_REQUEST_NOT_FOUND_OR_CLOSED'; end if;

  select * into v_original from public.playlist_sale_offers where id=v_request.offer_id;
  if v_original.id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  select coalesce(array_agg(distinct r.track_id),array[]::uuid[]) into v_ids
  from unnest(v_request.requested_track_ids) r(track_id)
  join public.playlist_sale_offer_tracks pst on pst.offer_id=v_request.offer_id and pst.track_id=r.track_id;
  if cardinality(v_ids)=0 then raise exception 'REQUEST_HAS_NO_AVAILABLE_TRACKS'; end if;

  insert into public.playlist_sale_offers(
    id,seller_id,playlist_id,playlist_name,price_cents,currency_code,cover_url,
    payment_mode,free_price,is_active,target_buyer_id
  )
  values (
    v_new_offer_id,uid,'keep-request:'||v_new_offer_id::text,
    left(v_original.playlist_name||' · offre perso',100),
    0,'EUR',null,'FREE',p_free_price,true,v_request.buyer_id
  );

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

create or replace function public.keep_playlist_sale_offers_for_profile(p_profile_id uuid)
returns table(offer_id uuid,playlist_id text,playlist_name text,payment_mode text,price_cents integer,free_price integer,currency_code text,cover_url text,track_count integer,genres text[])
language sql stable security definer
set search_path=public,auth
as $$
  select
    o.id,o.playlist_id,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,
    o.currency_code::text,null::text,
    cardinality(public.keep_playlist_sale_track_ids(o.seller_id,o.playlist_id))::integer,
    coalesce((
      select array_agg(distinct g order by g)
      from unnest(public.keep_playlist_sale_track_ids(o.seller_id,o.playlist_id)) tid
      join public.tracks t on t.id=tid
      cross join lateral unnest(coalesce(t.genres,array[]::text[])) g
      where nullif(trim(g),'') is not null
    ),array[]::text[])
  from public.playlist_sale_offers o
  where o.seller_id=p_profile_id
    and o.is_active=true
    and (o.target_buyer_id is null or o.target_buyer_id=auth.uid())
  order by o.updated_at desc;
$$;

create or replace function public.keep_profile_sale_suggestions(p_limit integer default 8)
returns table(offer_id uuid,seller_id uuid,seller_username text,seller_avatar_url text,playlist_name text,track_count integer,genres text[],payment_mode text,price_cents integer,free_price integer,currency_code character,match_score integer)
language sql stable security definer
set search_path=public,auth
as $$
with viewer_genres as (
  select distinct lower(trim(g)) genre
  from (
    select unnest(coalesce(p.favorite_genres,'{}'::text[])) g from public.profiles p where p.id=auth.uid()
    union all
    select unnest(coalesce(t.genres,'{}'::text[])) g
    from public.keep_decisions kd join public.tracks t on t.id=kd.track_id
    where kd.profile_id=auth.uid() and kd.decision in ('KEEP','KEPT')
  ) x where nullif(trim(g),'') is not null
),
affinity as (
  select p.id seller_id,
    case when exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=p.id) then 35 else 0 end
    + case when exists(select 1 from public.keep_decisions kd where kd.profile_id=auth.uid() and kd.source_user_id=p.id and kd.decision in ('KEEP','KEPT')) then 45 else 0 end social_score
  from public.profiles p
),
offers as (
  select o.id offer_id,o.seller_id,p.username seller_username,p.avatar_url seller_avatar_url,
    o.playlist_name,count(distinct ot.track_id)::integer track_count,
    coalesce(array_agg(distinct g.genre) filter(where g.genre is not null),'{}'::text[]) genres,
    o.payment_mode,o.price_cents,o.free_price,o.currency_code,
    (count(distinct vg.genre)*20+coalesce(a.social_score,0))::integer match_score,o.updated_at
  from public.playlist_sale_offers o
  join public.profiles p on p.id=o.seller_id and p.is_public=true
  left join affinity a on a.seller_id=o.seller_id
  left join public.playlist_sale_offer_tracks ot on ot.offer_id=o.id
  left join public.tracks t on t.id=ot.track_id
  left join lateral(select unnest(coalesce(t.genres,'{}'::text[])) genre) g on true
  left join viewer_genres vg on vg.genre=lower(trim(g.genre))
  where o.is_active=true
    and o.target_buyer_id is null
    and (auth.uid() is null or o.seller_id<>auth.uid())
  group by o.id,p.username,p.avatar_url,o.playlist_name,o.payment_mode,o.price_cents,o.free_price,o.currency_code,o.updated_at,a.social_score
)
select offer_id,seller_id,seller_username,seller_avatar_url,playlist_name,track_count,genres,payment_mode,price_cents,free_price,currency_code,match_score
from offers
where match_score>0 or auth.uid() is null
order by match_score desc,updated_at desc
limit greatest(1,least(coalesce(p_limit,8),20));
$$;

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
  if v_offer.target_buyer_id is not null and v_offer.target_buyer_id is distinct from uid then
    raise exception 'OFFER_NOT_FOUND_OR_INACTIVE';
  end if;
  v_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id);
  v_total := coalesce(cardinality(v_ids),0);
  if uid is not null and v_total>0 then
    select count(*)::integer into v_owned
    from unnest(v_ids) t(track_id)
    where public.keep_playlist_sale_track_is_owned(uid,t.track_id);
  end if;
  return jsonb_build_object('totalCount',v_total,'ownedCount',v_owned,'missingCount',greatest(v_total-v_owned,0));
end;
$$;

create or replace function public.keep_playlist_sale_offer_preview_tracks_v2(p_offer_id uuid)
returns table(track_id uuid,preview_url text,already_owned boolean)
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
  where pso.id=p_offer_id
    and pso.is_active=true
    and (pso.target_buyer_id is null or pso.target_buyer_id=uid)
    and t.preview_url is not null and t.preview_url<>''
  order by random();
end;
$$;

create or replace function public.keep_playlist_sale_purchase_with_free(p_offer_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth
as $$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_payment public.playlist_sale_payments%rowtype;
  v_result jsonb;
  v_balance integer;
  v_buyer_username text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform 1 from public.profiles where id=uid for update;

  select * into v_offer from public.playlist_sale_offers
  where id=p_offer_id and is_active=true for update;

  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.target_buyer_id is not null and v_offer.target_buyer_id<>uid then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id=uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;
  if v_offer.payment_mode<>'FREE' or v_offer.free_price is null then raise exception 'OFFER_NOT_PAYABLE_WITH_FREE'; end if;

  select * into v_payment from public.playlist_sale_payments
  where offer_id=p_offer_id and buyer_id=uid and status='COMPLETED'
  order by created_at desc limit 1;

  if v_payment.id is not null then
    return jsonb_build_object(
      'paymentId',v_payment.id,'playlistId',v_payment.delivered_playlist_id,
      'trackCount',cardinality(public.keep_playlist_sale_track_ids(v_offer.seller_id,v_offer.playlist_id)),
      'freePrice',v_offer.free_price,
      'remainingFree',public.keep_theoretical_free_credit_remaining_for_profile(uid),
      'alreadyUnlocked',true
    );
  end if;

  v_balance := public.keep_theoretical_free_credit_remaining_for_profile(uid);
  if v_balance<v_offer.free_price then raise exception 'NOT_ENOUGH_FREE:%:%',v_balance,v_offer.free_price; end if;

  insert into public.playlist_sale_payments(offer_id,seller_id,buyer_id,amount_cents,amount_free,currency_code,platform_fee_cents,status,provider)
  values(v_offer.id,v_offer.seller_id,uid,0,v_offer.free_price,'EUR',0,'PENDING','FREE_CREDITS')
  returning * into v_payment;

  insert into public.playlist_sale_free_transfers(payment_id,offer_id,seller_id,buyer_id,amount_free)
  values(v_payment.id,v_offer.id,v_offer.seller_id,uid,v_offer.free_price);

  v_result := public.keep_playlist_sale_deliver_payment_core(v_payment.id);
  select username into v_buyer_username from public.profiles where id=uid;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    v_offer.seller_id,'PLAYLIST_SALE_COMPLETED','⚡ FREE reçus',
    coalesce('@'||v_buyer_username,'Un utilisateur')||' a débloqué « '||v_offer.playlist_name||' » pour '||v_offer.free_price||' FREE.',
    jsonb_build_object('event','PLAYLIST_SALE_COMPLETED','paymentId',v_payment.id,'offerId',v_offer.id,'buyerId',uid,'paymentMode','FREE','freeAmount',v_offer.free_price,'soundKind','money'),
    'CREATED',0
  );

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  values(
    uid,'PLAYLIST_SALE_DELIVERED','✓ Collection débloquée',
    '« '||v_offer.playlist_name||' » est maintenant dans ton Loki Music pour '||v_offer.free_price||' FREE.',
    jsonb_build_object('event','PLAYLIST_SALE_DELIVERED','paymentId',v_payment.id,'offerId',v_offer.id,'sellerId',v_offer.seller_id,'paymentMode','FREE','freeAmount',v_offer.free_price,'playlistId',v_result->>'playlistId'),
    'CREATED',0
  );

  return v_result || jsonb_build_object(
    'freePrice',v_offer.free_price,
    'remainingFree',public.keep_theoretical_free_credit_remaining_for_profile(uid),
    'alreadyUnlocked',false
  );
end;
$$;
