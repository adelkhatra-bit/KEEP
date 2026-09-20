-- Durcissement explicite des nouvelles RPC sensibles. PostgreSQL accorde
-- EXECUTE à PUBLIC par défaut, même si un GRANT authenticated suit.

revoke all on function public.keep_playlist_sale_set_price_for_selection_v2(uuid[], text, integer, text, text) from public, anon;
grant execute on function public.keep_playlist_sale_set_price_for_selection_v2(uuid[], text, integer, text, text) to authenticated;

revoke all on function public.keep_playlist_sale_mark_paid_and_deliver(uuid) from public, anon;
grant execute on function public.keep_playlist_sale_mark_paid_and_deliver(uuid) to authenticated;

-- La vitrine est volontairement publique : elle ne révèle que le nom, la
-- jaquette, le nombre de titres et le prix, jamais les morceaux masqués.
grant execute on function public.keep_playlist_sale_offers_for_profile(uuid) to anon, authenticated;

create index if not exists idx_playlist_sale_payments_delivered_playlist
  on public.playlist_sale_payments(delivered_playlist_id)
  where delivered_playlist_id is not null;

