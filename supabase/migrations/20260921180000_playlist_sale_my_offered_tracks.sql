-- BUG RÉEL (Adel, 21/09/2026, profil adel4a) : un morceau déjà inclus dans
-- une offre "sélection multiple" (setPlaylistSalePriceForSelection) devient
-- invisible pour la logique client une fois l'app rechargée. Cause : côté
-- client, l'offre était indexée dans myOffers par une clé ÉPHÉMÈRE
-- ('selection:<timestamp>', générée à la volée dans createSaleSelection),
-- jamais par les IDs des morceaux qui la composent. Après un rechargement,
-- loadMyPlaylistSaleOffers() ne renvoie que playlist_id/playlist_name (pas
-- les morceaux), donc plus aucun moyen de savoir qu'UN morceau précis
-- appartient déjà à une offre active -- ni badge "déjà en vente", ni
-- exclusion propre de la sélection multiple.
--
-- Cette RPC comble exactement ce trou : le détail morceau -> offre active,
-- pour CE vendeur, réutilisable pour construire un badge "En vente" et
-- désactiver proprement la case à cocher correspondante.
create or replace function public.keep_playlist_sale_my_offered_track_ids()
returns table(
  track_id uuid,
  offer_id uuid,
  playlist_id text,
  playlist_name text,
  price_cents integer,
  currency_code text
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select pst.track_id, pso.id, pso.playlist_id, pso.playlist_name, pso.price_cents, pso.currency_code::text
  from public.playlist_sale_offer_tracks pst
  join public.playlist_sale_offers pso on pso.id = pst.offer_id
  where pso.seller_id = auth.uid()
    and pso.is_active = true;
$function$;
grant execute on function public.keep_playlist_sale_my_offered_track_ids() to authenticated;
