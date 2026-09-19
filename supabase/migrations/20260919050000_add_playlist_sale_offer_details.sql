-- Détails de l'offre marketplace pour la modale preview
-- Retourne trackCount, genres principaux, artistes top et durée totale

create or replace function public.keep_playlist_sale_offer_details(p_playlist_id text)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $function$
  select jsonb_build_object(
    'playlistId', p_playlist_id,
    'trackCount', (
      select count(distinct track_id)::integer
      from public.playlist_sale_offer_tracks pst
      join public.playlist_sale_offers pso on pso.id = pst.offer_id
      where pso.playlist_id = p_playlist_id and pso.is_active = true
    ),
    'topArtists', coalesce(
      jsonb_agg(distinct t.artist_name) filter (where t.artist_name is not null),
      '[]'::jsonb
    ),
    'genres', coalesce(
      jsonb_agg(distinct t.genre_tag) filter (where t.genre_tag is not null),
      '[]'::jsonb
    ),
    'duration', (
      select sum((t.duration_ms)::integer / 1000)
      from public.playlist_sale_offer_tracks pst
      join public.playlist_sale_offers pso on pso.id = pst.offer_id
      join public.tracks t on t.id = pst.track_id
      where pso.playlist_id = p_playlist_id and pso.is_active = true
    )
  )
  from public.playlist_sale_offer_tracks pst
  join public.playlist_sale_offers pso on pso.id = pst.offer_id
  join public.tracks t on t.id = pst.track_id
  where pso.playlist_id = p_playlist_id and pso.is_active = true
  group by p_playlist_id
$function$;

grant execute on function public.keep_playlist_sale_offer_details(text) to authenticated, anon;
