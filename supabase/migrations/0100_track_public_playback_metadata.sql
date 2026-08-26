-- KEEP stores only tiny catalog metadata needed to re-open/re-preview a track.
-- No audio file is copied into Supabase Storage or PostgreSQL.
alter table public.tracks add column if not exists preview_url text;
alter table public.tracks add column if not exists external_urls jsonb not null default '{}'::jsonb;
alter table public.tracks add column if not exists available_on text[] not null default '{}'::text[];

comment on column public.tracks.preview_url is
  'Temporary catalog preview URL only; KEEP never stores audio bytes.';
comment on column public.tracks.external_urls is
  'Small provider deep-link metadata (Apple Music, Spotify, universal, YouTube search).';
comment on column public.tracks.available_on is
  'Provider labels known at recognition time.';
