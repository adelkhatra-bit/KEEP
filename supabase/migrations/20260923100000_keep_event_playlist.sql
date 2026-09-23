-- Mission Playlist de soirée (Adel 23/09/2026) : l'onglet PLAYLIST de
-- PartiesScreen existait déjà côté UI mais n'était jamais alimenté
-- (EVENT_COLUMNS ne sélectionnait pas playlist_id). Cette fonction résout la
-- playlist rattachée à un événement (events.playlist_id) et renvoie ses
-- morceaux, triés par ordre d'ajout.
--
-- Règle marketplace ABSOLUE : un morceau actuellement EN VENTE par
-- l'organisateur ne doit jamais être révélé gratuitement par un autre chemin
-- du profil. On EXCLUT donc les morceaux présents dans une offre de vente
-- active (playlist_sale_offer_tracks ↔ playlist_sale_offers.is_active) du
-- créateur de l'événement. Aucun titre/jaquette de morceau en vente ne fuit
-- via la playlist de soirée.
--
-- SECURITY DEFINER + total public (ce n'est pas une liste nominative, juste
-- la playlist publique d'un événement), cohérent avec les autres RPC
-- keep_event_*.
CREATE OR REPLACE FUNCTION public.keep_event_playlist(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'artist', t.artist,
        'album', t.album,
        'artworkUrl', t.artwork_url,
        'durationSec', t.duration_sec
      )
      order by pt.added_at asc
    ),
    '[]'::jsonb
  )
  from public.events e
  join public.playlist_tracks pt on pt.playlist_id = e.playlist_id
  join public.tracks t on t.id = pt.track_id
  where e.id = p_event_id
    and e.playlist_id is not null
    -- Exclusion des morceaux en vente par l'organisateur (anti-fuite marketplace)
    and not exists (
      select 1
      from public.playlist_sale_offer_tracks ot
      join public.playlist_sale_offers o on o.id = ot.offer_id
      where ot.track_id = t.id
        and o.seller_id = e.creator_id
        and o.is_active = true
    );
$function$;

revoke all on function public.keep_event_playlist(uuid) from public;
grant execute on function public.keep_event_playlist(uuid) to anon, authenticated;
