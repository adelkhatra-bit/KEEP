-- KEEP — 0002: Morceaux canoniques, playlists, routage intelligent, apprentissage

create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  isrc text unique,
  title text not null,
  artist text not null,
  album text,
  duration_sec int,
  artwork_url text,
  genres text[] not null default '{}',
  provider_ids jsonb not null default '{}', -- {"spotify": "...", "appleMusic": "...", ...}
  created_at timestamptz not null default now()
);
create index if not exists idx_tracks_isrc on tracks(isrc);
create index if not exists idx_tracks_title_artist on tracks (lower(title), lower(artist));

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  provider text not null, -- provider où vit réellement la playlist ('spotify', 'appleMusic', ...)
  provider_playlist_id text, -- null tant que non créée côté provider
  name text not null,
  description text,
  is_public boolean not null default false,
  is_smart boolean not null default false, -- gérée par SmartPlaylistRouter
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_playlists_owner on playlists(owner_id);

create table if not exists playlist_tracks (
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id uuid not null references tracks(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_via text not null default 'keep', -- 'keep' | 'import' | 'manual'
  primary key (playlist_id, track_id)
);

-- Historique GARDER/PASSER — alimente analytics + apprentissage.
create table if not exists keep_decisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  track_id uuid not null references tracks(id),
  decision text not null check (decision in ('KEPT', 'PASSED')),
  recommended_playlist_id uuid references playlists(id),
  chosen_playlist_id uuid references playlists(id),
  was_correction boolean not null default false,
  context jsonb, -- { hourOfDay, dayOfWeek }
  created_at timestamptz not null default now()
);
create index if not exists idx_keep_decisions_profile on keep_decisions(profile_id, created_at desc);

-- Poids appris par le SmartPlaylistRouter, scopés par utilisateur (jamais partagés entre utilisateurs).
create table if not exists routing_weights (
  profile_id uuid not null references profiles(id) on delete cascade,
  weight_type text not null check (weight_type in ('artist', 'genre')),
  weight_key text not null, -- nom d'artiste ou de genre
  playlist_id uuid not null references playlists(id) on delete cascade,
  weight numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (profile_id, weight_type, weight_key, playlist_id)
);

-- Pondérations globales du SmartPlaylistRouter, administrables + versionnées (§95).
create table if not exists router_config_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  config jsonb not null, -- SmartRouterWeightsConfig
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default false
);
create unique index if not exists idx_router_config_one_active on router_config_versions(is_active) where is_active;

create trigger trg_playlists_updated_at before update on playlists
  for each row execute function set_updated_at();
