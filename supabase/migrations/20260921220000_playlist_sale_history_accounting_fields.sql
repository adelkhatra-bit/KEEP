-- Adel (21/09/2026, mission 3/3) : "Écran historique des ventes : liste
-- transactions pour le vendeur (base compta : seller_id, buyer_id,
-- playlist_id, amount, currency, status, dates, paypal_tx_id)." Le schéma
-- de playlist_sale_payments a déjà tous ces champs (voir
-- 20260914080000_keep_playlist_sale_foundation.sql : seller_id, buyer_id,
-- amount_cents, currency_code, status, created_at, provider,
-- provider_payment_id -- ce dernier sert de "paypal_tx_id" générique tant
-- qu'il n'y a pas de vraie intégration PayPal) + delivered_at (paid_at)
-- ajouté le 20/09. keep_playlist_sale_my_sales() ne les exposait pas tous.

-- Le type de retour change (plus de colonnes) -- Postgres refuse un
-- create or replace qui changerait la forme des colonnes OUT, il faut
-- explicitement supprimer l'ancienne définition d'abord.
drop function if exists public.keep_playlist_sale_my_sales();

create or replace function public.keep_playlist_sale_my_sales()
returns table(
  id uuid,
  buyer_id uuid,
  buyer_username text,
  playlist_id text,
  playlist_name text,
  amount_cents integer,
  currency_code text,
  status text,
  provider text,
  provider_payment_id text,
  created_at timestamptz,
  delivered_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select p.id, p.buyer_id, b.username, o.playlist_id, o.playlist_name, p.amount_cents, p.currency_code, p.status, p.provider, p.provider_payment_id, p.created_at, p.delivered_at
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id = p.offer_id
  join public.profiles b on b.id = p.buyer_id
  where p.seller_id = auth.uid()
  order by p.created_at desc;
$function$;
grant execute on function public.keep_playlist_sale_my_sales() to authenticated;

-- Référence de paiement optionnelle (ex. identifiant de transaction PayPal
-- collé par le vendeur) -- utile pour la compta même sans intégration
-- PayPal réelle (voir docs/PLATFORM_COMPLIANCE.md §9.2, décision d'Adel :
-- "reste sur le fonctionnement manuel pour l'instant"). Ajoute un
-- paramètre optionnel à la signature -- en Postgres, create or replace
-- avec une liste de paramètres différente crée une SURCHARGE au lieu de
-- remplacer, on aurait deux fonctions ambiguës pour PostgREST (appel avec
-- p_payment_id seul). On retire donc explicitement l'ancienne signature à
-- un seul argument avant de créer la nouvelle -- une seule fonction doit
-- exister derrière ce nom.
drop function if exists public.keep_playlist_sale_mark_paid_and_deliver(uuid);

create or replace function public.keep_playlist_sale_mark_paid_and_deliver(p_payment_id uuid, p_payment_reference text default null)
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
  set status = 'COMPLETED',
      delivered_playlist_id = v_playlist_id,
      delivered_at = coalesce(delivered_at, now()),
      provider_payment_id = coalesce(v_clean_reference, provider_payment_id)
  where id = v_payment.id;

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
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid, text) to authenticated;
