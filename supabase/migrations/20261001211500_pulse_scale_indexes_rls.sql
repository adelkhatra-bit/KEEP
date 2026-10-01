-- Scale Loki Pulse / music DNA for large audiences.
-- Add missing FK indexes and make owner-read RLS evaluate auth.uid() once per statement.

create index if not exists idx_music_pulse_theme_affinity_theme_code
  on public.music_pulse_theme_affinity(theme_code);

create index if not exists idx_profile_loki_pulse_events_track_id
  on public.profile_loki_pulse_events(track_id);

drop policy if exists own_profile_music_taste_genres on public.profile_music_taste_genres;
create policy own_profile_music_taste_genres
  on public.profile_music_taste_genres
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists own_profile_music_taste_artists on public.profile_music_taste_artists;
create policy own_profile_music_taste_artists
  on public.profile_music_taste_artists
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists profile_music_genre_affinity_owner_read on public.profile_music_genre_affinity;
create policy profile_music_genre_affinity_owner_read
  on public.profile_music_genre_affinity
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists profile_music_artist_affinity_owner_read on public.profile_music_artist_affinity;
create policy profile_music_artist_affinity_owner_read
  on public.profile_music_artist_affinity
  for select
  to authenticated
  using (profile_id = (select auth.uid()));
