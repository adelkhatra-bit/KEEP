-- Mémoire musicale collective KEEP : empreintes générées localement
-- (algorithme façon Shazam, supabase/functions/_shared/audioFingerprint.ts)
-- à partir d'extraits légaux déjà récupérés (Deezer/iTunes previewUrl) quand
-- un morceau est identifié avec confiance par un autre moteur ou par
-- recherche manuelle. Permet à KEEP de reconnaître un morceau déjà vu, même
-- absent des catalogues AudD/ACRCloud (contenu indépendant/underground).

create table if not exists public.keep_fingerprint_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  album text,
  artwork_url text,
  preview_url text,
  external_urls jsonb not null default '{}'::jsonb,
  provider_ids jsonb not null default '{}'::jsonb,
  hash_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists keep_fingerprint_tracks_title_artist_key
  on public.keep_fingerprint_tracks (lower(title), lower(artist));

create table if not exists public.keep_fingerprint_hashes (
  hash bigint not null,
  track_id uuid not null references public.keep_fingerprint_tracks(id) on delete cascade,
  time_offset_ms integer not null
);

create index if not exists keep_fingerprint_hashes_hash_idx
  on public.keep_fingerprint_hashes (hash);

alter table public.keep_fingerprint_tracks enable row level security;
alter table public.keep_fingerprint_hashes enable row level security;

-- Écriture/lecture réservées au service_role (edge functions) : cette
-- mémoire n'est jamais exposée ou modifiable directement par un client.
drop policy if exists keep_fingerprint_tracks_service_only on public.keep_fingerprint_tracks;
create policy keep_fingerprint_tracks_service_only on public.keep_fingerprint_tracks
  for all to service_role using (true) with check (true);

drop policy if exists keep_fingerprint_hashes_service_only on public.keep_fingerprint_hashes;
create policy keep_fingerprint_hashes_service_only on public.keep_fingerprint_hashes
  for all to service_role using (true) with check (true);
