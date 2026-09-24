-- Détails NON IDENTIFIANTS d'une collection marketplace.
-- Retourne uniquement le nombre de morceaux, les styles et la durée totale.
-- Confidentialité : jamais de titre, artiste, album ou vraie jaquette avant déblocage.

create or replace function public.keep_playlist_sale_offer_details(p_playlist_id text)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $function$
  select jsonb_build_object(
    'playlistId', p_playlist_id,
    'trackCount', coalesce((
      select count(distinct pst.track_id)::integer
      from public.playlist_sale_offer_tracks pst
      join public.playlist_sale_offers pso on pso.id = pst.offer_id
      where pso.playlist_id = p_playlist_id and pso.is_active = true
    ), 0),
    'genres', coalesce((
      select jsonb_agg(x.genre order by x.genre)
      from (
        select distinct trim(g) as genre
        from public.playlist_sale_offer_tracks pst
        join public.playlist_sale_offers pso on pso.id = pst.offer_id
        join public.tracks t on t.id = pst.track_id
        cross join lateral unnest(coalesce(t.genres, array[]::text[])) g
        where pso.playlist_id = p_playlist_id
          and pso.is_active = true
          and nullif(trim(g), '') is not null
      ) x
    ), '[]'::jsonb),
    'duration', coalesce((
      select sum(coalesce(t.duration_sec, 0))::integer
      from public.playlist_sale_offer_tracks pst
      join public.playlist_sale_offers pso on pso.id = pst.offer_id
      join public.tracks t on t.id = pst.track_id
      where pso.playlist_id = p_playlist_id and pso.is_active = true
    ), 0)
  );
$function$;

grant execute on function public.keep_playlist_sale_offer_details(text) to authenticated, anon;
