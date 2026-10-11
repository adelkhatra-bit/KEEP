-- Épingles de story masquées : la décision « masquée » se calcule côté serveur (épinglée en vente OU musique d'une offre active), jamais côté lecteur. Additif.
create or replace function public.keep_story_masked_pins(p_profile_ids uuid[])
returns table(profile_id uuid, track_id uuid, pinned_at timestamptz, preview_url text)
language sql stable security definer set search_path to 'public', 'auth' as $$
  select sp.profile_id, sp.track_id, sp.pinned_at, t.preview_url
  from public.story_pins sp
  join public.tracks t on t.id = sp.track_id
  where sp.profile_id = any(p_profile_ids)
    and sp.pinned_at > now() - interval '24 hours'
    and t.preview_url is not null and t.preview_url <> ''
    and (
      sp.masked
      or exists (
        select 1 from public.playlist_sale_offers o
        join public.playlist_sale_offer_tracks pt on pt.offer_id = o.id
        where o.seller_id = sp.profile_id and o.is_active = true
          and (o.target_buyer_id is null or o.target_buyer_id = auth.uid())
          and pt.track_id = sp.track_id
      )
    )
  order by sp.pinned_at desc;
$$;
revoke all on function public.keep_story_masked_pins(uuid[]) from public, anon;
grant execute on function public.keep_story_masked_pins(uuid[]) to authenticated;
