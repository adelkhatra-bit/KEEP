-- Adel (21/09/2026) : "Popup Public/Masqué post-achat : après paiement,
-- choix immédiat 'Rendre publique' / 'Garder masquée'." Le paiement est
-- confirmé manuellement par le VENDEUR (pas de webhook temps réel côté
-- acheteur, voir docs/PLATFORM_COMPLIANCE.md §9.2) : "immédiat" veut donc
-- dire concrètement "à la prochaine fois que l'app de l'acheteur regarde
-- ses achats" -- pas une notification push synchrone. keep_decisions
-- reste PRIVATE par défaut (comportement déjà en place), ce nouveau
-- mécanisme ajoute juste le choix explicite qui manquait, une seule fois
-- par achat.
alter table public.playlist_sale_payments
  add column if not exists visibility_choice_made boolean not null default false;

-- Les paiements déjà livrés avant cette migration n'ont jamais eu ce choix
-- -- on ne les fait pas réapparaître en popup rétroactivement (bruit inutile
-- pour un achat déjà ancien), ils restent PRIVATE comme aujourd'hui.
update public.playlist_sale_payments
set visibility_choice_made = true
where status = 'COMPLETED' and delivered_at is not null;

create or replace function public.keep_playlist_sale_pending_visibility_choice()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_seller_username text;
  v_track_count integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where buyer_id = uid and status = 'COMPLETED' and visibility_choice_made = false
    and delivered_playlist_id is not null
  order by delivered_at desc nulls last, created_at desc
  limit 1;

  if v_payment.id is null then return null; end if;

  select username into v_seller_username from public.profiles where id = v_payment.seller_id;
  select count(*)::integer into v_track_count from public.playlist_tracks where playlist_id = v_payment.delivered_playlist_id;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'playlistId', v_payment.delivered_playlist_id,
    'sellerUsername', coalesce(v_seller_username, ''),
    'trackCount', coalesce(v_track_count, 0)
  );
end;
$function$;
grant execute on function public.keep_playlist_sale_pending_visibility_choice() to authenticated;

create or replace function public.keep_playlist_sale_choose_delivered_visibility(p_payment_id uuid, p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_payment public.playlist_sale_payments%rowtype;
  v_offer public.playlist_sale_offers%rowtype;
  v_track_ids uuid[];
  v_visibility text := case when p_public then 'PUBLIC' else 'PRIVATE' end;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select * into v_payment
  from public.playlist_sale_payments
  where id = p_payment_id and buyer_id = uid and status = 'COMPLETED'
  for update;
  if v_payment.id is null then raise exception 'PAYMENT_NOT_FOUND_OR_NOT_YOURS'; end if;
  if v_payment.delivered_playlist_id is null then raise exception 'NOT_DELIVERED_YET'; end if;

  select * into v_offer from public.playlist_sale_offers where id = v_payment.offer_id;
  if v_offer.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  v_track_ids := public.keep_playlist_sale_track_ids(v_offer.seller_id, v_offer.playlist_id);

  update public.playlists set is_public = p_public where id = v_payment.delivered_playlist_id;

  update public.keep_decisions
  set visibility = v_visibility
  where profile_id = uid and track_id = any(v_track_ids) and decision = 'KEPT';

  update public.playlist_sale_payments set visibility_choice_made = true where id = v_payment.id;

  return jsonb_build_object('paymentId', v_payment.id, 'playlistId', v_payment.delivered_playlist_id, 'isPublic', p_public);
end;
$function$;
grant execute on function public.keep_playlist_sale_choose_delivered_visibility(uuid, boolean) to authenticated;
