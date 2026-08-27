create unique index if not exists playlists_owner_provider_external_uidx
on public.playlists(owner_id, provider, provider_playlist_id);
