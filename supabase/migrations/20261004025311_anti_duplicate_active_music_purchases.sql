-- Loki Music — anti-doublon achats (Mobile + Web)
-- Empêche un double-clic, deux onglets ou deux appareils de créer deux achats actifs.

create unique index if not exists playlist_sale_payments_one_active_per_buyer_offer_uidx
  on public.playlist_sale_payments (offer_id, buyer_id)
  where status in ('PENDING','COMPLETED');

create unique index if not exists artist_track_orders_one_active_per_buyer_track_uidx
  on public.artist_track_orders (track_id, buyer_id)
  where status in ('PENDING','COMPLETED');

create or replace function public.keep_playlist_sale_request_purchase(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
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
  perform 1 from public.profiles where id=uid for update;

  select * into v_offer
  from public.playlist_sale_offers
  where id = p_offer_id and is_active = true
  for update;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.target_buyer_id is not null and v_offer.target_buyer_id <> uid then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id = uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;
  if v_offer.payment_mode not in ('MONEY','BOTH') or coalesce(v_offer.price_cents,0)<=0 then raise exception 'OFFER_NOT_PAYABLE_WITH_MONEY'; end if;

  select username,payout_link,payout_qr_url
  into v_seller_username,v_payout_link,v_payout_qr_url
  from public.profiles where id=v_offer.seller_id;

  if nullif(trim(coalesce(v_payout_link,'')),'') is null and nullif(trim(coalesce(v_payout_qr_url,'')),'') is null then raise exception 'SELLER_PAYOUT_NOT_CONFIGURED'; end if;
  if nullif(trim(coalesce(v_payout_link,'')),'') is not null and v_payout_link !~* '^https://' then raise exception 'SELLER_PAYOUT_LINK_INSECURE'; end if;
  if nullif(trim(coalesce(v_payout_qr_url,'')),'') is not null and v_payout_qr_url !~* '^https://' then raise exception 'SELLER_PAYOUT_QR_INSECURE'; end if;

  select * into v_existing
  from public.playlist_sale_payments
  where offer_id=p_offer_id and buyer_id=uid and status in ('PENDING','COMPLETED')
  order by case when status='COMPLETED' then 0 else 1 end, created_at desc
  limit 1
  for update;

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
    'buyerMarkedPaidAt',v_existing.buyer_marked_paid_at,
    'alreadyRequested',not v_created
  );
end;
$function$;

create or replace function public.keep_artist_track_request_purchase(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_track public.artist_original_tracks%rowtype;
  v_existing public.artist_track_orders%rowtype;
  v_seller_username text;
  v_payout_link text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  perform 1 from public.profiles where id=uid for update;

  select * into v_track
  from public.artist_original_tracks
  where id = p_track_id and is_active = true
  for update;
  if v_track.id is null then raise exception 'TRACK_NOT_FOUND_OR_INACTIVE'; end if;
  if v_track.seller_id = uid then raise exception 'CANNOT_BUY_OWN_TRACK'; end if;

  select * into v_existing
  from public.artist_track_orders
  where track_id = p_track_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by case when status='COMPLETED' then 0 else 1 end, created_at desc
  limit 1
  for update;

  if v_existing.id is null then
    insert into public.artist_track_orders(track_id, seller_id, buyer_id, amount_cents, currency_code, platform_fee_cents, status, provider)
    values (p_track_id, v_track.seller_id, uid, v_track.price_cents, v_track.currency_code, 0, 'PENDING', 'EXTERNAL_LINK')
    returning * into v_existing;
  end if;

  select username into v_seller_username from public.profiles where id = v_track.seller_id;
  select payout_link into v_payout_link from public.profiles where id = v_track.seller_id;

  return jsonb_build_object(
    'orderId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', v_payout_link
  );
end;
$function$;
