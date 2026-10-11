-- Secure / low-click payout link flow.
-- New payout links must use HTTPS. Purchase requests do not create orphan
-- PENDING rows when the seller has not configured a payout destination.

create or replace function public.keep_set_payout_link(p_url text)
returns text
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(p_url), '');
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if clean is not null and clean !~* '^https://' then
    raise exception 'PAYOUT_LINK_MUST_BE_HTTPS';
  end if;
  update public.profiles set payout_link = clean where id = uid;
  return clean;
end;
$function$;

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
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_offer
  from public.playlist_sale_offers
  where id = p_offer_id and is_active = true;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id = uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;

  select username, payout_link
  into v_seller_username, v_payout_link
  from public.profiles
  where id = v_offer.seller_id;

  if nullif(trim(coalesce(v_payout_link, '')), '') is null then
    raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
  end if;
  if v_payout_link !~* '^https://' then
    raise exception 'SELLER_PAYOUT_LINK_INSECURE';
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
  end if;

  return jsonb_build_object(
    'paymentId', v_existing.id,
    'status', v_existing.status,
    'amountCents', v_existing.amount_cents,
    'currencyCode', v_existing.currency_code,
    'sellerUsername', v_seller_username,
    'payoutLink', v_payout_link
  );
end;
$function$;
