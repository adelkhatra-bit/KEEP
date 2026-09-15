-- KEEP — identité canonique des morceaux fournisseurs.
-- Spotify / Apple Music / Deezer attribuent un identifiant stable à une piste.
-- Deux lignes `tracks` ne doivent donc jamais porter le même identifiant du
-- même fournisseur, même si l'ISRC manque ou si le titre varie légèrement.

create unique index if not exists tracks_spotify_provider_uidx
on public.tracks ((provider_ids->>'spotify'))
where nullif(provider_ids->>'spotify', '') is not null;

create unique index if not exists tracks_apple_music_provider_uidx
on public.tracks ((provider_ids->>'appleMusic'))
where nullif(provider_ids->>'appleMusic', '') is not null;

create unique index if not exists tracks_deezer_provider_uidx
on public.tracks ((provider_ids->>'deezer'))
where nullif(provider_ids->>'deezer', '') is not null;
