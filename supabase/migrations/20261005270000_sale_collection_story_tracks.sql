-- Collection mise en vente = ENTIÈRE en story pendant 24 h (Adel 05/10/2026). Additif : fonction en lecture seule, aucune donnée modifiée.
-- Les titres restent masqués côté lecteur (jaquette/artiste cachés) ; le serveur ne renvoie que l'extrait.
create or replace function public.keep_playlist_sale_story_tracks(p_seller_ids uuid[], p_limit integer default 100)
returns table(seller_id uuid, offer_id uuid, track_id uuid, preview_url text, listed_at timestamptz)
language sql
stable
security definer
set search_path = 'public', 'auth'
as $function$
  select ranked.seller_id, ranked.offer_id, ranked.track_id, ranked.preview_url, ranked.listed_at
  from (
    select pso.seller_id, pso.id as offer_id, pst.track_id, t.preview_url, pso.created_at as listed_at,
           row_number() over (partition by pso.seller_id order by pso.created_at desc, pst.track_id) as rn
    from public.playlist_sale_offers pso
    join public.playlist_sale_offer_tracks pst on pst.offer_id = pso.id
    join public.tracks t on t.id = pst.track_id
    where pso.seller_id = any(p_seller_ids)
      and pso.is_active = true
      and pso.created_at > now() - interval '24 hours'
      and (pso.target_buyer_id is null or pso.target_buyer_id = auth.uid())
      and t.preview_url is not null and t.preview_url <> ''
  ) ranked
  where ranked.rn <= least(greatest(coalesce(p_limit, 100), 1), 200);
$function$;
revoke all on function public.keep_playlist_sale_story_tracks(uuid[], integer) from public, anon;
grant execute on function public.keep_playlist_sale_story_tracks(uuid[], integer) to authenticated;
