-- KEEP / Loki Music — transaction conversation via notifications
-- Buyer signals "paid"; seller confirms receipt; only seller confirmation delivers.
-- External money remains outside KEEP. No automatic trust in PayPal/other providers.

alter table public.playlist_sale_payments
  add column if not exists buyer_marked_paid_at timestamptz,
  add column if not exists seller_last_reminded_at timestamptz;

create or replace function public.keep_playlist_sale_request_purchase(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  uid uuid := auth.uid();
  v_offer public.playlist_sale_offers%rowtype;
  v_existing public.playlist_sale_payments%rowtype;
  v_seller_username text;
  v_payout_link text;
  v_created boolean := false;
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
        'payoutLink',v_payout_link,
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
    'payoutLink', v_payout_link,
    'buyerMarkedPaidAt', v_existing.buyer_marked_paid_at
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_request_purchase(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_request_purchase(uuid) to authenticated;

create or replace function public.keep_playlist_sale_buyer_mark_paid(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_buyer_username text;
  v_seller_username text;
  v_marked_at timestamptz;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and buyer_id = uid
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status = 'COMPLETED' then
    return jsonb_build_object(
      'paymentId',v_payment.id,
      'status','COMPLETED',
      'buyerMarkedPaidAt',v_payment.buyer_marked_paid_at,
      'alreadyDelivered',true
    );
  end if;
  if v_payment.status <> 'PENDING' then raise exception 'PAYMENT_NOT_PENDING'; end if;

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;

  if v_payment.buyer_marked_paid_at is null then
    v_marked_at := now();
    update public.playlist_sale_payments
    set buyer_marked_paid_at = v_marked_at,
        seller_last_reminded_at = null
    where id = v_payment.id;

    select username into v_buyer_username from public.profiles where id = uid;
    select username into v_seller_username from public.profiles where id = v_payment.seller_id;

    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      v_payment.seller_id,
      'PLAYLIST_SALE_BUYER_PAID',
      'Paiement signalé',
      coalesce('@' || v_buyer_username,'Un acheteur') || ' indique avoir payé « ' ||
        v_offer.playlist_name || ' ». Vérifie ton paiement puis confirme pour débloquer la sélection.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_BUYER_PAID',
        'paymentId',v_payment.id,
        'offerId',v_offer.id,
        'buyerId',uid,
        'buyerUsername',v_buyer_username,
        'playlistName',v_offer.playlist_name,
        'amountCents',v_payment.amount_cents,
        'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'soundKind','money'
      ),
      'CREATED',
      0
    );

    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      uid,
      'PLAYLIST_SALE_WAITING_SELLER',
      'Paiement signalé',
      'Ton paiement pour « ' || v_offer.playlist_name || ' » est signalé à ' ||
        coalesce('@' || v_seller_username,'au vendeur') ||
        '. La sélection se débloquera dès qu’il confirme la réception.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_WAITING_SELLER',
        'paymentId',v_payment.id,
        'offerId',v_offer.id,
        'sellerId',v_payment.seller_id,
        'sellerUsername',v_seller_username,
        'playlistName',v_offer.playlist_name,
        'soundKind','money'
      ),
      'CREATED',
      0
    );
  else
    v_marked_at := v_payment.buyer_marked_paid_at;
  end if;

  return jsonb_build_object(
    'paymentId',v_payment.id,
    'status','PENDING',
    'buyerMarkedPaidAt',v_marked_at,
    'alreadyDelivered',false
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_buyer_mark_paid(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_buyer_mark_paid(uuid) to authenticated;

create or replace function public.keep_playlist_sale_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment record;
  v_offer public.playlist_sale_offers%rowtype;
  v_buyer_username text;
  v_count integer := 0;
begin
  for v_payment in
    select p.*
    from public.playlist_sale_payments p
    where p.status = 'PENDING'
      and p.buyer_marked_paid_at is not null
      and p.buyer_marked_paid_at <= now() - interval '4 hours'
      and (p.seller_last_reminded_at is null or p.seller_last_reminded_at <= now() - interval '24 hours')
    order by p.buyer_marked_paid_at asc
    limit 100
    for update skip locked
  loop
    select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
    if v_offer.id is null then continue; end if;
    select username into v_buyer_username from public.profiles where id = v_payment.buyer_id;

    insert into public.notifications(
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values(
      v_payment.seller_id,
      'PLAYLIST_SALE_PAYMENT_REMINDER',
      'Paiement à confirmer',
      coalesce('@' || v_buyer_username,'Un acheteur') ||
        ' attend le déblocage de « ' || v_offer.playlist_name ||
        ' ». Confirme uniquement si l’argent est bien arrivé.',
      jsonb_build_object(
        'event','PLAYLIST_SALE_PAYMENT_REMINDER',
        'paymentId',v_payment.id,
        'offerId',v_offer.id,
        'buyerId',v_payment.buyer_id,
        'buyerUsername',v_buyer_username,
        'playlistName',v_offer.playlist_name,
        'amountCents',v_payment.amount_cents,
        'currencyCode',upper(coalesce(v_payment.currency_code,'EUR')),
        'soundKind','money'
      ),
      'CREATED',
      0
    );

    update public.playlist_sale_payments
    set seller_last_reminded_at = now()
    where id = v_payment.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.keep_playlist_sale_payment_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'keep-playlist-sale-payment-reminders') then
    perform cron.unschedule('keep-playlist-sale-payment-reminders');
  end if;
  perform cron.schedule(
    'keep-playlist-sale-payment-reminders',
    '0 * * * *',
    'select public.keep_playlist_sale_payment_reminders();'
  );
exception
  when undefined_table or undefined_function or insufficient_privilege then
    null;
end $$;
