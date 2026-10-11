-- BUG FIX (19/09/2026) : Race condition double insertion
-- Problème : keep_artist_track_request_purchase() utilise SELECT + IF NULL + INSERT
-- sans atomicité → deux threads peuvent insérer deux fois la même commande
-- Solution : Ajouter UNIQUE constraint partielle + convertir à UPSERT

-- Pour artist_track_orders : empêcher doublon (track, buyer) dans PENDING/COMPLETED.
-- Une contrainte UNIQUE ne peut pas porter de prédicat WHERE en PostgreSQL :
-- la primitive correcte est un index unique partiel, également compatible
-- avec ON CONFLICT (... ) WHERE ... ci-dessous.
create unique index if not exists unique_artist_track_pending_completed
on public.artist_track_orders(track_id, buyer_id)
where status in ('PENDING', 'COMPLETED');

-- Pour playlist_sale_payments : même règle atomique, sous forme d'index partiel.
create unique index if not exists unique_playlist_pending_completed
on public.playlist_sale_payments(offer_id, buyer_id)
where status in ('PENDING', 'COMPLETED');

-- Mise à jour : keep_artist_track_request_purchase
-- Remplacer SELECT+IF+INSERT par UPSERT atomique
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
  select * into v_track from public.artist_original_tracks where id = p_track_id and is_active = true;
  if v_track.id is null then raise exception 'TRACK_NOT_FOUND_OR_INACTIVE'; end if;
  if v_track.seller_id = uid then raise exception 'CANNOT_BUY_OWN_TRACK'; end if;

  -- UPSERT atomique : si commande PENDING/COMPLETED existe, la retourner ; sinon créer
  insert into public.artist_track_orders(track_id, seller_id, buyer_id, amount_cents, currency_code, platform_fee_cents, status, provider)
  values (p_track_id, v_track.seller_id, uid, v_track.price_cents, v_track.currency_code, 0, 'PENDING', 'EXTERNAL_LINK')
  on conflict (track_id, buyer_id) where status in ('PENDING', 'COMPLETED')
  do update set id = excluded.id
  returning * into v_existing;

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

-- Mise à jour : keep_playlist_sale_request_purchase
-- Même logique (SELECT+IF+INSERT → UPSERT)
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
  v_result jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  select * into v_offer from public.playlist_sale_offers where id = p_offer_id and is_active = true;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND_OR_INACTIVE'; end if;
  if v_offer.seller_id = uid then raise exception 'CANNOT_BUY_OWN_PLAYLIST'; end if;

  -- UPSERT atomique : si paiement PENDING/COMPLETED existe, le retourner ; sinon créer
  insert into public.playlist_sale_payments(offer_id, seller_id, buyer_id, amount_cents, currency_code, platform_fee_cents, status, provider)
  values (p_offer_id, v_offer.seller_id, uid, v_offer.price_cents, v_offer.currency_code, 0, 'PENDING', 'EXTERNAL_LINK')
  on conflict (offer_id, buyer_id) where status in ('PENDING', 'COMPLETED')
  do update set id = excluded.id
  returning * into v_existing;

  select username into v_seller_username from public.profiles where id = v_offer.seller_id;
  select payout_link into v_payout_link from public.profiles where id = v_offer.seller_id;

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

-- Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
-- Claude-Session: https://claude.ai/code/session_014XdCPchT6vDAK2W89g4vaM
