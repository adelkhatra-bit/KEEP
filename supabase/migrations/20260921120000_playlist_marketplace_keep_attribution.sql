-- Correctif : la livraison d'un achat de playlist marketplace ne créait
-- jamais de ligne keep_decisions pour l'acheteur (voir audit Claude Code,
-- 21/09/2026, demandé par Adel). Les morceaux achetés atterrissaient
-- uniquement dans playlists/playlist_tracks (une playlist "fantôme"),
-- jamais dans "Ma collection", jamais comptés dans discoveryImpacts, et
-- le découvreur d'origine ne recevait aucune reconnaissance "1er KEEP".
--
-- Décisions d'Adel (21/09/2026) :
-- 1. Attribution : le VRAI découvreur d'origine, jamais simplement le
--    vendeur si celui-ci avait lui-même obtenu le morceau socialement --
--    on remonte la chaîne. keep-music-core (action "decision") résout déjà
--    exactement ce cas via resolveSocialOrigin() : on réutilise la même
--    règle ici plutôt que d'en inventer une seconde.
-- 2. Coût : 0 Free pour l'acheteur, comme une reprise sociale (il a déjà
--    payé en argent réel -- jamais de double débit).
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

  -- Attribution "1er KEEP" + entrée réelle dans "Ma collection" de
  -- l'acheteur, un morceau à la fois.
  foreach v_track_id in array v_track_ids loop
    -- Même règle que resolveSocialOrigin() (keep-music-core, action
    -- "decision") : si le VENDEUR a lui-même une décision KEPT avec un
    -- source_user_id renseigné, ce profil-là est le vrai découvreur
    -- d'origine ; sinon le vendeur est l'origine. Contrairement à
    -- resolveSocialOrigin(), on ne restreint pas à visibility='PUBLIC' --
    -- l'éligibilité à la vente (keep_playlist_sale_set_price_for_selection_v2)
    -- ne l'exige déjà pas non plus (un morceau privé du vendeur reste
    -- vendable), donc la résolution d'origine ne doit pas être plus
    -- restrictive que la vente elle-même.
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

    -- Idempotent comme partout ailleurs sur keep_decisions (aucune
    -- contrainte unique en base, dédoublonnage applicatif -- voir
    -- existingKeptDecision() dans keep-music-core) : un GARDER déjà
    -- présent n'est jamais recréé ni écrasé.
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
