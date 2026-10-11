-- Une seule collection peut proposer deux moyens de déblocage : FREE et paiement direct.
-- Aucun doublon d'offre ni de morceau n'est créé : payment_mode='BOTH' vit sur la même ligne.

alter table public.playlist_sale_offers
  drop constraint if exists playlist_sale_offers_payment_mode_check;
alter table public.playlist_sale_offers
  add constraint playlist_sale_offers_payment_mode_check
  check (payment_mode in ('MONEY','FREE','BOTH'));

alter table public.playlist_sale_offers
  drop constraint if exists playlist_sale_offers_free_price_check;
alter table public.playlist_sale_offers
  add constraint playlist_sale_offers_free_price_check
  check (
    (payment_mode='MONEY' and free_price is null and price_cents in (50,100,200,300,500,1000))
    or
    (payment_mode='FREE' and free_price between 1 and 500 and price_cents=0)
    or
    (payment_mode='BOTH' and free_price between 1 and 500 and price_cents in (50,100,200,300,500,1000))
  );

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
set search_path to 'public','auth'
as $function$
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
  if clean_mode not in ('MONEY','FREE','BOTH') then raise exception 'PAYMENT_MODE_INVALID'; end if;

  if clean_mode='MONEY' then
    if clean_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_free := null;
  elsif clean_mode='FREE' then
    if clean_free is null or clean_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    clean_money := 0;
  else
    if clean_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    if clean_free is null or clean_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
  end if;

  if length(clean_name)>100 then raise exception 'PLAYLIST_NAME_TOO_LONG'; end if;
  if clean_cover is not null and clean_cover !~* '^https://' then raise exception 'COVER_URL_MUST_BE_HTTPS'; end if;

  access := public.keep_playlist_sale_access();
  if not (access->>'unlocked')::boolean then
    raise exception 'PLAYLIST_SALE_LOCKED:%',(access->>'threshold');
  end if;

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
    select 1
    from public.keep_decisions kd2
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

  perform public.keep_enqueue_playlist_sale_fanout(new_offer_id);

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
$function$;

create or replace function public.keep_playlist_sale_update_payment_mode(
  p_offer_id uuid,
  p_payment_mode text,
  p_price_cents integer default null,
  p_free_price integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_mode text := upper(coalesce(nullif(trim(p_payment_mode),''),'MONEY'));
  v_money integer := coalesce(p_price_cents,0);
  v_free integer := p_free_price;
  v_offer public.playlist_sale_offers%rowtype;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_offer
  from public.playlist_sale_offers
  where id=p_offer_id and seller_id=uid
  for update;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_NOT_YOURS'; end if;

  if v_mode='MONEY' then
    if v_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    v_free := null;
  elsif v_mode='FREE' then
    if v_free is null or v_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    v_money := 0;
  elsif v_mode='BOTH' then
    if v_money not in (50,100,200,300,500,1000) then raise exception 'PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
    if v_free is null or v_free not in (1,3,5,10,20,50,100) then raise exception 'FREE_PRICE_MUST_BE_A_PRESET_AMOUNT'; end if;
  else
    raise exception 'PAYMENT_MODE_INVALID';
  end if;

  update public.playlist_sale_offers
  set payment_mode=v_mode,
      price_cents=v_money,
      free_price=v_free,
      updated_at=now()
  where id=v_offer.id
  returning * into v_offer;

  return jsonb_build_object(
    'offerId',v_offer.id,
    'paymentMode',v_offer.payment_mode,
    'priceCents',v_offer.price_cents,
    'freePrice',v_offer.free_price,
    'currencyCode',v_offer.currency_code
  );
end;
$function$;

create or replace function public.keep_playlist_sale_purchase_with_free(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
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
  if v_offer.payment_mode not in ('FREE','BOTH') or v_offer.free_price is null then raise exception 'OFFER_NOT_PAYABLE_WITH_FREE'; end if;

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
$function$;

create or replace function public.keep_playlist_sale_request_purchase(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_existing public.playlist_sale_payments%rowtype;
  v_seller_username text;
  v_payout_link text;
  v_payout_qr_url text;
  v_created boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_offer
  from public.playlist_sale_offers
  where id = p_offer_id and is_active = true;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id = uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;
  if v_offer.payment_mode not in ('MONEY','BOTH') or coalesce(v_offer.price_cents,0)<=0 then
    raise exception 'OFFER_NOT_PAYABLE_WITH_MONEY';
  end if;

  select username,payout_link,payout_qr_url
  into v_seller_username,v_payout_link,v_payout_qr_url
  from public.profiles
  where id=v_offer.seller_id;

  if nullif(trim(coalesce(v_payout_link,'')),'') is null
     and nullif(trim(coalesce(v_payout_qr_url,'')),'') is null then
    raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
  end if;
  if nullif(trim(coalesce(v_payout_link,'')),'') is not null and v_payout_link !~* '^https://' then
    raise exception 'SELLER_PAYOUT_LINK_INSECURE';
  end if;
  if nullif(trim(coalesce(v_payout_qr_url,'')),'') is not null and v_payout_qr_url !~* '^https://' then
    raise exception 'SELLER_PAYOUT_QR_INSECURE';
  end if;

  select * into v_existing
  from public.playlist_sale_payments
  where offer_id=p_offer_id and buyer_id=uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

  if v_existing.id is null then
    if not exists (
      select 1 from public.playlist_sale_payments p
      where p.buyer_id=uid and p.status='COMPLETED'
        and coalesce(p.amount_free,0)=0 and coalesce(p.provider,'')<>'FREE_CREDITS'
    ) and exists (
      select 1 from public.playlist_sale_payments p
      where p.buyer_id=uid and p.status='PENDING'
        and coalesce(p.amount_free,0)=0 and coalesce(p.provider,'')<>'FREE_CREDITS'
    ) then
      raise exception 'FIRST_PAYMENT_PENDING';
    end if;

    insert into public.playlist_sale_payments(
      offer_id,seller_id,buyer_id,amount_cents,currency_code,platform_fee_cents,status,provider
    )
    values(
      p_offer_id,v_offer.seller_id,uid,v_offer.price_cents,v_offer.currency_code,0,'PENDING','EXTERNAL_LINK'
    )
    returning * into v_existing;
    v_created := true;
  end if;

  if v_created then
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      uid,'PLAYLIST_SALE_PAYMENT_READY','Prêt à payer',
      '« '||v_offer.playlist_name||' » · ouvre le paiement, joins ta preuve puis envoie-la au vendeur.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_PAYMENT_READY','paymentId',v_existing.id,'offerId',v_offer.id,
        'sellerId',v_offer.seller_id,'sellerUsername',v_seller_username,'playlistName',v_offer.playlist_name,
        'amountCents',v_existing.amount_cents,'currencyCode',upper(coalesce(v_existing.currency_code,'EUR')),
        'payoutLink',coalesce(v_payout_link,''),'payoutQrUrl',coalesce(v_payout_qr_url,''),'soundKind','money'
      ),
      'CREATED',0
    );
  end if;

  return jsonb_build_object(
    'paymentId',v_existing.id,'status',v_existing.status,'amountCents',v_existing.amount_cents,
    'currencyCode',v_existing.currency_code,'sellerUsername',v_seller_username,
    'payoutLink',coalesce(v_payout_link,''),'payoutQrUrl',coalesce(v_payout_qr_url,''),
    'buyerMarkedPaidAt',v_existing.buyer_marked_paid_at
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) from public,anon;
revoke all on function public.keep_playlist_sale_update_payment_mode(uuid,text,integer,integer) from public,anon;
revoke all on function public.keep_playlist_sale_purchase_with_free(uuid) from public,anon;
revoke all on function public.keep_playlist_sale_request_purchase(uuid) from public,anon;

grant execute on function public.keep_playlist_sale_set_offer_for_selection_v6(uuid[],text,text,integer,integer,text,text,boolean) to authenticated;
grant execute on function public.keep_playlist_sale_update_payment_mode(uuid,text,integer,integer) to authenticated;
grant execute on function public.keep_playlist_sale_purchase_with_free(uuid) to authenticated;
grant execute on function public.keep_playlist_sale_request_purchase(uuid) to authenticated;
