-- Adel (16-17/09/2026) : "je vérifie comment ils font TikTok ... l'idéal
-- c'est que nous, on encaisse rien, c'est tous les utilisateurs qui
-- encaissent directement ... l'utilisateur se débrouille avec un PayPal,
-- un truc perso ... comme ça, ça ne mélange pas nos comptabilités avec
-- Loki." Vérifié (recherche réelle) : TikTok fait l'INVERSE de ça --
-- TikTok encaisse tout (achat de coins), garde ~50% de commission, puis
-- reverse en différé (5-21 jours) via PayPal/virement -- exactement le
-- modèle "on encaisse tout et on reverse" qu'Adel juge déjà trop
-- compliqué. Ce n'est donc PAS le modèle à copier.
--
-- Remplace l'implémentation précédente (keep-stripe-playlist-checkout /
-- keep-stripe-playlist-webhook) qui malgré son nom "STRIPE_CONNECT"
-- n'utilisait AUCUN Stripe Connect réel : une seule clé Stripe plateforme,
-- donc tout l'argent de TOUS les vendeurs aurait fini sur UN SEUL compte
-- sans aucun mécanisme de reversement -- l'exact opposé de la demande
-- d'Adel, avec un vrai risque de requalification en établissement de
-- paiement. Cette implémentation n'a jamais eu de clé configurée en
-- production (vérifié : aucun secret Stripe/Brevo dans Supabase avant ce
-- correctif), donc aucun argent réel n'a été concerné.
--
-- Nouveau modèle ("lien de paiement personnel") : KEEP ne touche JAMAIS
-- l'argent. Chaque vendeur colle son propre lien (PayPal.me, Lydia, lien
-- de paiement Stripe personnel, etc.) une seule fois dans ses réglages.
-- L'acheteur clique "Acheter" -> KEEP ouvre ce lien externe (le paiement
-- se passe entièrement hors KEEP, sur le compte du vendeur) ET crée une
-- demande PENDING pour que le vendeur sache qui a l'intention de payer.
-- Le vendeur, une fois payé sur SON PayPal/Stripe perso, tape "Marquer
-- comme payé" -- ça débloque l'accès pour CET acheteur précis. KEEP ne
-- voit jamais un centime, ne détient jamais l'argent, donc 0% de
-- commission est vrai par construction (pas juste une promesse).

alter table public.profiles add column if not exists payout_link text;

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
  if clean is not null and clean !~* '^https?://' then raise exception 'PAYOUT_LINK_MUST_BE_A_URL'; end if;
  update public.profiles set payout_link = clean where id = uid;
  return clean;
end;
$function$;
grant execute on function public.keep_set_payout_link(text) to authenticated;

create or replace function public.keep_payout_link_for_profile(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select payout_link from public.profiles where id = p_profile_id;
$function$;
grant execute on function public.keep_payout_link_for_profile(uuid) to authenticated, anon;

-- ============================================================
-- PLAYLISTS -- demande d'achat + confirmation manuelle vendeur
-- ============================================================

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

  select * into v_existing from public.playlist_sale_payments
  where offer_id = p_offer_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

  if v_existing.id is null then
    insert into public.playlist_sale_payments(offer_id, seller_id, buyer_id, amount_cents, currency_code, platform_fee_cents, status, provider)
    values (p_offer_id, v_offer.seller_id, uid, v_offer.price_cents, v_offer.currency_code, 0, 'PENDING', 'EXTERNAL_LINK')
    returning * into v_existing;
  end if;

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
grant execute on function public.keep_playlist_sale_request_purchase(uuid) to authenticated;

create or replace function public.keep_playlist_sale_mark_paid(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  update public.playlist_sale_payments
  set status = 'COMPLETED'
  where id = p_payment_id and seller_id = uid and status = 'PENDING';
  if not found then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
end;
$function$;
grant execute on function public.keep_playlist_sale_mark_paid(uuid) to authenticated;

create or replace function public.keep_playlist_sale_my_sales()
returns table(id uuid, buyer_username text, playlist_name text, amount_cents integer, currency_code text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select p.id, b.username, o.playlist_name, p.amount_cents, p.currency_code, p.status, p.created_at
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id = p.offer_id
  join public.profiles b on b.id = p.buyer_id
  where p.seller_id = auth.uid()
  order by p.created_at desc;
$function$;
grant execute on function public.keep_playlist_sale_my_sales() to authenticated;

create or replace function public.keep_playlist_sale_my_purchases()
returns table(id uuid, seller_username text, playlist_name text, amount_cents integer, currency_code text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select p.id, s.username, o.playlist_name, p.amount_cents, p.currency_code, p.status, p.created_at
  from public.playlist_sale_payments p
  join public.playlist_sale_offers o on o.id = p.offer_id
  join public.profiles s on s.id = p.seller_id
  where p.buyer_id = auth.uid()
  order by p.created_at desc;
$function$;
grant execute on function public.keep_playlist_sale_my_purchases() to authenticated;

-- Démasquage : un acheteur avec un paiement COMPLETED pour une offre voit
-- désormais ses morceaux -- tout le monde d'autre continue de les voir
-- masqués (comportement inchangé pour eux).
create or replace function public.keep_playlist_sale_masked_track_ids(p_seller_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_offer record;
  v_ids uuid[] := array[]::uuid[];
  v_batch uuid[];
  v_viewer uuid := auth.uid();
  v_purchased_offer_ids uuid[];
begin
  if p_seller_id is null then return array[]::uuid[]; end if;
  if v_viewer is not null then
    select coalesce(array_agg(offer_id), array[]::uuid[]) into v_purchased_offer_ids
    from public.playlist_sale_payments
    where buyer_id = v_viewer and status = 'COMPLETED';
  else
    v_purchased_offer_ids := array[]::uuid[];
  end if;
  for v_offer in select id, playlist_id from public.playlist_sale_offers where seller_id = p_seller_id and is_active = true loop
    if v_offer.id = any(v_purchased_offer_ids) then continue; end if;
    v_batch := public.keep_playlist_sale_track_ids(p_seller_id, v_offer.playlist_id);
    v_ids := v_ids || v_batch;
  end loop;
  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(v_ids) x);
end;
$function$;
grant execute on function public.keep_playlist_sale_masked_track_ids(uuid) to anon, authenticated;

-- ============================================================
-- MUSIQUE ORIGINALE (ARTISTE) -- meme principe
-- ============================================================

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

  select * into v_existing from public.artist_track_orders
  where track_id = p_track_id and buyer_id = uid and status in ('PENDING','COMPLETED')
  order by created_at desc limit 1;

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
grant execute on function public.keep_artist_track_request_purchase(uuid) to authenticated;

create or replace function public.keep_artist_track_mark_paid(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required'; end if;
  update public.artist_track_orders
  set status = 'COMPLETED'
  where id = p_order_id and seller_id = uid and status = 'PENDING';
  if not found then raise exception 'ORDER_NOT_FOUND_OR_NOT_YOURS'; end if;
end;
$function$;
grant execute on function public.keep_artist_track_mark_paid(uuid) to authenticated;

create or replace function public.keep_artist_track_my_sales()
returns table(id uuid, buyer_username text, track_title text, amount_cents integer, currency_code text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select o.id, b.username, t.title, o.amount_cents, o.currency_code, o.status, o.created_at
  from public.artist_track_orders o
  join public.artist_original_tracks t on t.id = o.track_id
  join public.profiles b on b.id = o.buyer_id
  where o.seller_id = auth.uid()
  order by o.created_at desc;
$function$;
grant execute on function public.keep_artist_track_my_sales() to authenticated;

create or replace function public.keep_artist_track_my_purchases()
returns table(id uuid, seller_username text, track_title text, amount_cents integer, currency_code text, status text, created_at timestamptz, track_id uuid)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select o.id, s.username, t.title, o.amount_cents, o.currency_code, o.status, o.created_at, o.track_id
  from public.artist_track_orders o
  join public.artist_original_tracks t on t.id = o.track_id
  join public.profiles s on s.id = o.seller_id
  where o.buyer_id = auth.uid()
  order by o.created_at desc;
$function$;
grant execute on function public.keep_artist_track_my_purchases() to authenticated;

-- Livraison du fichier complet : un acheteur avec une commande COMPLETED
-- peut désormais lire l'objet du bucket privé artist-track-masters (via
-- createSignedUrl côté client, qui respecte cette policy) -- personne
-- d'autre ne peut, achat ou pas.
do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'storage schema absent: policy acheteur ignoree en CI';
    return;
  end if;
  execute 'drop policy if exists "artist_track_masters_buyer_read" on storage.objects';
  execute $pol$create policy "artist_track_masters_buyer_read" on storage.objects for select to authenticated using (
    bucket_id = 'artist-track-masters' and exists (
      select 1 from public.artist_track_orders o
      join public.artist_original_tracks t on t.id = o.track_id
      where o.buyer_id = auth.uid() and o.status = 'COMPLETED' and t.master_storage_path = storage.objects.name
    )
  )$pol$;
end $$;
