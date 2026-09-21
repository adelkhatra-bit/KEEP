-- Adel (21/09/2026) : "Preview anonymisée avant achat -- vérifie qu'aucune
-- fuite n'existe : logs, state React, payload réseau, cache local."
--
-- FUITE RÉELLE TROUVÉE (payload réseau, pas juste théorique) :
-- keep_public_profile_tracks() -- appelée par PublicUserProfileScreen.tsx
-- via loadPublicProfileKeeps() pour charger TOUS les morceaux publics d'un
-- profil visité -- renvoyait titre/artiste/jaquette/preview_url en clair
-- pour TOUS les morceaux publics, y compris ceux actuellement masqués pour
-- une vente en cours. Le masquage (loadMaskedPlaylistSaleTrackIds) n'était
-- appliqué QUE côté client, après coup, en filtrant le tableau avant
-- setTracks() -- la réponse HTTP brute de cette RPC contenait déjà tout,
-- consultable par n'importe qui via les devtools réseau ou un proxy, sans
-- avoir besoin de payer. Corrigé en excluant ces morceaux DANS la requête
-- SQL elle-même, en réutilisant keep_playlist_sale_masked_track_ids() (déjà
-- utilisée ailleurs pour le même calcul, rien de nouveau inventé) --
-- jamais appliqué au propriétaire du profil (auth.uid() = p_profile_id),
-- qui doit toujours voir sa propre bibliothèque en entier, comme avant.
create or replace function public.keep_public_profile_tracks(p_profile_id uuid, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0)
returns table(decision_id uuid, kept_at timestamp with time zone, track_id uuid, isrc text, title text, artist text, album text, duration_sec integer, artwork_url text, genres text[], provider_ids jsonb, preview_url text, external_urls jsonb, available_on text[], context jsonb, source_user_id uuid, source_type text)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  with masked as (
    select case when auth.uid() = p_profile_id then array[]::uuid[] else public.keep_playlist_sale_masked_track_ids(p_profile_id) end as ids
  ),
  latest as (
    select distinct on (kd.track_id)
      kd.id as decision_id,
      kd.created_at as kept_at,
      kd.visibility::text as visibility,
      kd.track_id,
      t.isrc,
      t.title,
      t.artist,
      t.album,
      t.duration_sec,
      t.artwork_url,
      t.genres,
      t.provider_ids,
      t.preview_url,
      t.external_urls,
      t.available_on,
      kd.context,
      kd.source_user_id,
      kd.source_type::text as source_type
    from public.keep_decisions kd
    join public.profiles p on p.id = kd.profile_id
    join public.tracks t on t.id = kd.track_id
    where kd.profile_id = p_profile_id
      and p.is_public = true
      and kd.decision = 'KEPT'
    order by kd.track_id, kd.created_at desc, kd.id desc
  )
  select
    decision_id,
    kept_at,
    track_id,
    isrc,
    title,
    artist,
    album,
    duration_sec,
    artwork_url,
    genres,
    provider_ids,
    preview_url,
    external_urls,
    available_on,
    context,
    source_user_id,
    source_type
  from latest, masked
  where visibility = 'PUBLIC'
    and not (track_id = any(masked.ids))
  order by kept_at desc, decision_id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;
