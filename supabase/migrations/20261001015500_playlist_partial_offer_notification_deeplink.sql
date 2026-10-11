-- Ensure a private partial-offer notification can deep-link back to its seller profile.
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
    v_request.buyer_id,
    'PLAYLIST_SALE_PARTIAL_OFFER',
    '⚡ Offre perso reçue',
    coalesce('@'||v_seller_username,'Le créateur')||' te propose '||cardinality(v_ids)||' morceau'||case when cardinality(v_ids)>1 then 'x' else '' end||' manquant'||case when cardinality(v_ids)>1 then 's' else '' end||' pour '||p_free_price||' FREE.',
    jsonb_build_object(
      'event','PLAYLIST_SALE_PARTIAL_OFFER',
      'requestId',v_request.id,
      'offerId',v_new_offer_id,
      'sellerId',uid,
      'sellerUsername',v_seller_username,
      'freePrice',p_free_price,
      'trackCount',cardinality(v_ids)
    ),
    'CREATED',0
  );

  return jsonb_build_object('offerId',v_new_offer_id,'trackCount',cardinality(v_ids),'freePrice',p_free_price);
end;
$$;
