-- Loki Money notifications: amount formatting + dedicated money sound metadata.
-- A sale price is the TOTAL price of the complete selection.

create or replace function public.keep_playlist_sale_mark_paid_and_deliver(
  p_payment_id uuid,
  p_payment_reference text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_playlist_id uuid;
  v_track_ids uuid[];
  v_track_id uuid;
  v_origin_id uuid;
  v_buyer_username text;
  v_clean_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_amount_text text;
  v_was_pending boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and seller_id = uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status not in ('PENDING', 'COMPLETED') then raise exception 'PAYMENT_NOT_DELIVERABLE'; end if;
  v_was_pending := v_payment.status = 'PENDING';

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id, v_offer.playlist_id);
  if cardinality(v_track_ids) = 0 then raise exception 'OFFER_HAS_NO_TRACKS'; end if;

  select id into v_playlist_id
  from public.playlists
  where owner_id = v_payment.buyer_id
    and provider = 'loki_marketplace'
    and provider_playlist_id = 'purchase:' || v_payment.id::text
  limit 1;

  if v_playlist_id is null then
    insert into public.playlists(owner_id, provider, provider_playlist_id, name, description, is_public, is_smart, cover_url)
    values (
      v_payment.buyer_id,
      'loki_marketplace',
      'purchase:' || v_payment.id::text,
      v_offer.playlist_name,
      'Playlist achetée sur Loki',
      false,
      false,
      v_offer.cover_url
    )
    returning id into v_playlist_id;
  end if;

  insert into public.playlist_tracks(playlist_id, track_id, added_via)
  select v_playlist_id, track_id, 'MARKETPLACE_PURCHASE'
  from unnest(v_track_ids) track_id
  on conflict (playlist_id, track_id) do nothing;

  foreach v_track_id in array v_track_ids loop
    select coalesce(
      (select kd.source_user_id
       from public.keep_decisions kd
       where kd.profile_id = v_offer.seller_id
         and kd.track_id = v_track_id
         and kd.decision = 'KEPT'
       order by kd.created_at desc
       limit 1),
      v_offer.seller_id
    ) into v_origin_id;

    if not exists (
      select 1 from public.keep_decisions
      where profile_id = v_payment.buyer_id and track_id = v_track_id and decision = 'KEPT'
    ) then
      insert into public.keep_decisions(profile_id, track_id, decision, visibility, context, source_type, source_user_id)
      values (
        v_payment.buyer_id,
        v_track_id,
        'KEPT',
        'PRIVATE',
        jsonb_build_object('source', 'marketplace_purchase', 'paymentId', v_payment.id, 'offerId', v_offer.id, 'sellerId', v_offer.seller_id),
        'profile',
        v_origin_id
      );
    end if;
  end loop;

  update public.playlist_sale_payments
  set status = 'COMPLETED',
      delivered_playlist_id = v_playlist_id,
      delivered_at = coalesce(delivered_at, now()),
      provider_payment_id = coalesce(v_clean_reference, provider_payment_id)
  where id = v_payment.id;

  if v_was_pending then
    select username into v_buyer_username from public.profiles where id = v_payment.buyer_id;
    v_amount_text := replace(to_char(v_payment.amount_cents::numeric / 100, 'FM999999990.00'), '.', ',')
      || case when upper(coalesce(v_payment.currency_code, 'EUR')) = 'EUR'
        then ' €'
        else ' ' || upper(v_payment.currency_code)
      end;

    insert into public.notifications (
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values (
      v_offer.seller_id,
      'PLAYLIST_SALE_COMPLETED',
      '💰 Paiement reçu',
      coalesce('@' || v_buyer_username, 'Un acheteur')
        || ' a débloqué « ' || v_offer.playlist_name || ' » pour '
        || v_amount_text || ' au total.',
      jsonb_build_object(
        'event', 'PLAYLIST_SALE_COMPLETED',
        'paymentId', v_payment.id,
        'offerId', v_offer.id,
        'buyerId', v_payment.buyer_id,
        'amountCents', v_payment.amount_cents,
        'currencyCode', upper(coalesce(v_payment.currency_code, 'EUR')),
        'trackCount', cardinality(v_track_ids),
        'priceScope', 'OFFER_TOTAL',
        'soundKind', 'money'
      ),
      'CREATED',
      0
    );

    insert into public.notifications (
      profile_id, type, title, body, data, push_delivery_status, push_attempt_count
    )
    values (
      v_payment.buyer_id,
      'PLAYLIST_SALE_DELIVERED',
      '✓ Sélection débloquée',
      '« ' || v_offer.playlist_name || ' » est maintenant disponible dans ton Loki Music.',
      jsonb_build_object(
        'event', 'PLAYLIST_SALE_DELIVERED',
        'paymentId', v_payment.id,
        'offerId', v_offer.id,
        'sellerId', v_offer.seller_id,
        'playlistId', v_playlist_id,
        'trackCount', cardinality(v_track_ids)
      ),
      'CREATED',
      0
    );
  end if;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'buyerId', v_payment.buyer_id,
    'playlistId', v_playlist_id,
    'playlistName', v_offer.playlist_name,
    'trackCount', cardinality(v_track_ids),
    'deliveredAt', now()
  );
end;
$function$;

create or replace function public.keep_event_ticket_mark_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_order public.event_ticket_orders%rowtype;
  v_buyer_username text;
  v_event_name text;
  v_amount_text text;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  update public.event_ticket_orders set status = 'COMPLETED'
  where id = p_order_id and seller_id = uid and status = 'PENDING'
  returning * into v_order;
  if v_order.id is null then raise exception 'ORDER_NOT_FOUND_OR_NOT_YOURS'; end if;

  insert into public.event_rsvps(event_id, profile_id, status)
  values (v_order.event_id, v_order.buyer_id, 'GOING')
  on conflict (event_id, profile_id) do update set status = 'GOING';

  select username into v_buyer_username from public.profiles where id = v_order.buyer_id;
  select name into v_event_name from public.events where id = v_order.event_id;
  v_amount_text := replace(to_char(v_order.amount_cents::numeric / 100, 'FM999999990.00'), '.', ',')
    || case when upper(coalesce(v_order.currency_code, 'EUR')) = 'EUR'
      then ' €'
      else ' ' || upper(v_order.currency_code)
    end;

  insert into public.notifications (
    profile_id, type, title, body, data, push_delivery_status, push_attempt_count
  )
  values (
    v_order.seller_id,
    'EVENT_TICKET_SALE_COMPLETED',
    '💰 Paiement reçu',
    coalesce('@' || v_buyer_username, 'Un participant')
      || ' a payé ' || v_amount_text || ' pour « ' || coalesce(v_event_name, 'ta soirée') || ' ».',
    jsonb_build_object(
      'event', 'EVENT_TICKET_SALE_COMPLETED',
      'orderId', v_order.id,
      'eventId', v_order.event_id,
      'buyerId', v_order.buyer_id,
      'amountCents', v_order.amount_cents,
      'currencyCode', upper(coalesce(v_order.currency_code, 'EUR')),
      'soundKind', 'money'
    ),
    'CREATED',
    0
  );

  insert into public.notifications (
    profile_id, type, title, body, data, push_delivery_status, push_attempt_count
  )
  values (
    v_order.buyer_id,
    'EVENT_TICKET_CONFIRMED',
    '✓ Participation confirmée',
    'Ton paiement pour « ' || coalesce(v_event_name, 'cette soirée') || ' » a été confirmé.',
    jsonb_build_object(
      'event', 'EVENT_TICKET_CONFIRMED',
      'orderId', v_order.id,
      'eventId', v_order.event_id
    ),
    'CREATED',
    0
  );
end;
$function$;
