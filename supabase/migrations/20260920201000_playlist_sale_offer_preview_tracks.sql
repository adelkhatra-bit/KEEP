-- Pré-écoute anonyme masquée d'une offre marketplace playlist (Adel :
-- "je ne vends pas de la musique, je vends ma découverte et ma playlist" --
-- BACKLOG.md priorité 1 : "Pré-écoute de 15 secondes masquée").
--
-- Contrairement à keep_playlist_sale_offer_details (qui expose déjà
-- trackCount/topArtists/genres/duration en agrégat), cette fonction NE
-- RENVOIE JAMAIS titre, artiste ni jaquette par morceau -- uniquement
-- l'id technique (uuid, inutile pour identifier la chanson) et l'URL
-- d'extrait audio, dans un ordre aléatoire à chaque appel. Le client peut
-- ainsi faire jouer un extrait de 15 secondes sans jamais pouvoir
-- distinguer quelle piste est réellement en train de jouer.
create or replace function public.keep_playlist_sale_offer_preview_tracks(p_playlist_id text)
returns table(track_id uuid, preview_url text)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select t.id, t.preview_url
  from public.playlist_sale_offer_tracks pst
  join public.playlist_sale_offers pso on pso.id = pst.offer_id
  join public.tracks t on t.id = pst.track_id
  where pso.playlist_id = p_playlist_id
    and pso.is_active = true
    and t.preview_url is not null
    and t.preview_url <> ''
  order by random()
$function$;

grant execute on function public.keep_playlist_sale_offer_preview_tracks(text) to authenticated, anon;
