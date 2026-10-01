-- PayPal payout profile: keep PayPal.Me for same-device checkout and add
-- an optional PayPal QR image as a fallback. External marketplace flows stay
-- behind their existing Store-compliance feature flags.

alter table public.profiles
  add column if not exists payout_qr_url text;

create or replace function public.keep_my_payout_methods()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  v_link text;
  v_qr text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select payout_link, payout_qr_url into v_link, v_qr
  from public.profiles
  where id = uid;

  return jsonb_build_object(
    'link', coalesce(v_link, ''),
    'qrUrl', coalesce(v_qr, '')
  );
end;
$$;

revoke all on function public.keep_my_payout_methods() from public, anon;
grant execute on function public.keep_my_payout_methods() to authenticated;

create or replace function public.keep_set_payout_qr_url(p_url text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(p_url), '');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if clean is not null and clean !~* '^https://' then
    raise exception 'PAYOUT_QR_MUST_BE_HTTPS';
  end if;
  update public.profiles set payout_qr_url = clean where id = uid;
  return coalesce(clean, '');
end;
$$;

revoke all on function public.keep_set_payout_qr_url(text) from public, anon;
grant execute on function public.keep_set_payout_qr_url(text) to authenticated;

create or replace function public.keep_playlist_sale_request_purchase(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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

  select username, payout_link, payout_qr_url
  into v_seller_username, v_payout_link, v_payout_qr_url
  from public.profiles
  where id = v_offer.seller_id;

  if nullif(trim(coalesce(v_payout_link, '')), '') is null
     and nullif(trim(coalesce(v_payout_qr_url, '')), '') is null then
    raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
  end if;
  if nullif(trim(coalesce(v_payout_link, '')), '') is not null
     and v_payout_link !~* '^https://' then
    raise exception 'SELLER_PAYOUT_LINK_INSECURE';
  end if;
  if nullif(trim(coalesce(v_payout_qr_url, '')), '') is not null
     and v_payout_qr_url !~* '^https://' then
    raise exception 'SELLER_PAYOUT_QR_INSECURE';
  end if;

  select * into v_existing
  from public.playlist_sale_payments
  where offer_id = p_offer_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

  if v_existing.id is null then
    insert into public.playlist_sale_payments(
      offer_id, seller_id, buyer_id, amount_cents, currency_code,
      platform_fee_cents, status, provider
    )
    values (
      p_offer_id, v_offer.seller_id, uid, v_offer.price_cents,
      v_offer.currency_code, 0, 'PENDING', 'EXTERNAL_LINK'
    )
    returning * into v_existing;
    v_created := true;
  end if;

  if v_created then
    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      uid,
      'PLAYLIST_SALE_PAYMENT_READY',
      'Paiement prêt',
      '« ' || v_offer.playlist_name || ' » · ouvre le paiement, puis confirme ici quand c’est fait.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_PAYMENT_READY',
        'paymentId',v_existing.id,
        'offerId',v_offer.id,
        'sellerId',v_offer.seller_id,
        'sellerUsername',v_seller_username,
        'playlistName',v_offer.playlist_name,
        'amountCents',v_existing.amount_cents,
        'currencyCode',upper(coalesce(v_existing.currency_code,'EUR')),
        'payoutLink',coalesce(v_payout_link,''),
        'payoutQrUrl',coalesce(v_payout_qr_url,''),
        'soundKind','money'
      ),
      'CREATED',
      0
    );
  end if;

  return jsonb_build_object(
    'paymentId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', coalesce(v_payout_link,''),
    'payoutQrUrl', coalesce(v_payout_qr_url,''),
    'buyerMarkedPaidAt', v_existing.buyer_marked_paid_at
  );
end;
$$;

create or replace function public.keep_event_request_ticket_purchase(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing public.event_ticket_orders%rowtype;
  v_seller_username text;
  v_payout_link text;
  v_payout_qr_url text;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.ticket_price_cents is null then raise exception 'EVENT_IS_FREE'; end if;
  if v_event.creator_id = uid then raise exception 'CANNOT_BUY_OWN_TICKET'; end if;

  select * into v_existing from public.event_ticket_orders
  where event_id = p_event_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

  if v_existing.id is null then
    insert into public.event_ticket_orders(event_id, seller_id, buyer_id, amount_cents, currency_code, status, provider)
    values (p_event_id, v_event.creator_id, uid, v_event.ticket_price_cents, 'EUR', 'PENDING', 'EXTERNAL_LINK')
    returning * into v_existing;
  end if;

  select username, payout_link, payout_qr_url
  into v_seller_username, v_payout_link, v_payout_qr_url
  from public.profiles
  where id = v_event.creator_id;

  if nullif(trim(coalesce(v_payout_link, '')), '') is null
     and nullif(trim(coalesce(v_payout_qr_url, '')), '') is null then
    raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
  end if;

  return jsonb_build_object(
    'orderId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', coalesce(v_payout_link,''),
    'payoutQrUrl', coalesce(v_payout_qr_url,'')
  );
end;
$$;
