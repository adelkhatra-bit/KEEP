-- Un seul appel réseau pour le bouton global « ÉCOUTER LES APERÇUS ».
-- Renvoie exactement un extrait masqué par collection active d'un profil.
create or replace function public.keep_playlist_sale_profile_preview_sampler(p_seller_id uuid)
returns table(offer_id uuid, track_id uuid, preview_url text)
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  with allowed_offers as (
    select pso.id, pso.created_at
    from public.playlist_sale_offers pso
    where pso.seller_id = p_seller_id
      and pso.is_active = true
      and (pso.target_buyer_id is null or pso.target_buyer_id = auth.uid())
  )
  select
    offer.id as offer_id,
    sample.track_id,
    sample.preview_url
  from allowed_offers offer
  join lateral (
    select pst.track_id, t.preview_url
    from public.playlist_sale_offer_tracks pst
    join public.tracks t on t.id = pst.track_id
    where pst.offer_id = offer.id
      and t.preview_url is not null
      and t.preview_url <> ''
    order by pst.track_id
    limit 1
  ) sample on true
  order by offer.created_at desc;
$function$;

grant execute on function public.keep_playlist_sale_profile_preview_sampler(uuid) to anon, authenticated;
