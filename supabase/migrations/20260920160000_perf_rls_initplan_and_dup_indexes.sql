-- Audit Supabase performance (demandé par Adel, 20/09/2026). Deux correctifs
-- mécaniques, sans changement de comportement, uniquement de la vitesse :
--
-- 1) auth_rls_initplan (6 policies) : auth.uid() était appelée en clair dans
--    le USING de policies SELECT, donc réévaluée ligne par ligne. Remplacé
--    par (select auth.uid()) -- Postgres met alors le résultat en cache une
--    seule fois par requête (InitPlan). Même résultat, plus rapide à l'échelle.
-- 2) duplicate_index (2 paires) : deux index strictement identiques sur
--    recognition_rate_limits et track_likes -- on garde le plus ancien/plus
--    utilisé nommément, on supprime le doublon.

alter policy artist_original_tracks_read_own on public.artist_original_tracks
  using (( select auth.uid() ) = seller_id);

alter policy artist_track_orders_read_own on public.artist_track_orders
  using ((( select auth.uid() ) = seller_id) or (( select auth.uid() ) = buyer_id));

alter policy event_ticket_orders_read_own on public.event_ticket_orders
  using ((( select auth.uid() ) = seller_id) or (( select auth.uid() ) = buyer_id));

alter policy playlist_sale_offer_tracks_read_own on public.playlist_sale_offer_tracks
  using (exists (
    select 1 from public.playlist_sale_offers o
    where o.id = playlist_sale_offer_tracks.offer_id
      and o.seller_id = ( select auth.uid() )
  ));

alter policy playlist_sale_offers_read_own on public.playlist_sale_offers
  using (( select auth.uid() ) = seller_id);

alter policy playlist_sale_payments_read_own on public.playlist_sale_payments
  using ((( select auth.uid() ) = seller_id) or (( select auth.uid() ) = buyer_id));

drop index if exists public.idx_recognition_rate_limits_updated_at;
drop index if exists public.idx_track_likes_track;
