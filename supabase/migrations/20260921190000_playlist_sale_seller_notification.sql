-- Notification vendeur après vente (Adel, 21/09/2026) : "dès qu'un acheteur
-- paie, le vendeur reçoit une notification". La structure comptable
-- demandée (seller_id, buyer_id, montant, devise, statut, dates,
-- provider_payment_id) existe déjà intégralement sur playlist_sale_payments
-- depuis sa création (20260914080000) + delivered_at (20260920190000) --
-- rien à ajouter côté schéma, seulement l'insertion de la notification.
create or replace function public.keep_playlist_sale_mark_paid_and_deliver(p_payment_id uuid)
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
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and seller_id = uid
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.status not in ('PENDING', 'COMPLETED') then raise exception 'PAYMENT_NOT_DELIVERABLE'; end if;

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
  set status = 'COMPLETED', delivered_playlist_id = v_playlist_id, delivered_at = coalesce(delivered_at, now())
  where id = v_payment.id;

  -- (21/09/2026) Notification vendeur -- seule pièce manquante de ce flow,
  -- tout le reste (structure comptable, attribution) existait déjà.
  select username into v_buyer_username from public.profiles where id = v_payment.buyer_id;
  insert into public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
  values (
    v_offer.seller_id,
    'PLAYLIST_SALE_COMPLETED',
    '💶 Découverte vendue',
    coalesce('@' || v_buyer_username, 'Un acheteur') || ' a débloqué « ' || v_offer.playlist_name || ' » pour ' || (v_payment.amount_cents::numeric / 100) || ' ' || v_payment.currency_code || '.',
    jsonb_build_object('event', 'PLAYLIST_SALE_COMPLETED', 'paymentId', v_payment.id, 'offerId', v_offer.id, 'buyerId', v_payment.buyer_id, 'amountCents', v_payment.amount_cents, 'currencyCode', v_payment.currency_code),
    'pending',
    0
  );

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
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid) to authenticated;
