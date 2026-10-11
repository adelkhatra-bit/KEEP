-- Loki Music — consolidation anti-doublon marketplace.
-- Une migration concurrente a posé les triggers canoniques ; 25553 renforce
-- l'identité musicale. Retirer uniquement les doublons techniques.

drop trigger if exists keep_guard_playlist_sale_no_owned_tracks_trg
  on public.playlist_sale_payments;
drop trigger if exists keep_guard_playlist_sale_bundle_item_no_owned_tracks_trg
  on public.playlist_sale_bundle_payment_items;

drop function if exists public.keep_guard_playlist_sale_no_owned_tracks();
drop function if exists public.keep_guard_playlist_sale_bundle_item_no_owned_tracks();

drop index if exists public.playlist_sale_payments_one_active_per_offer_buyer_uidx;

-- Restent comme gardes canoniques :
-- playlist_sale_payments_one_active_per_buyer_offer_uidx
-- trg_keep_guard_playlist_sale_payment_duplicate_tracks
-- trg_keep_guard_playlist_sale_bundle_item_duplicate_tracks
