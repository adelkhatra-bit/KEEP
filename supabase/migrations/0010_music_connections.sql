-- KEEP — 0010: connexions des plateformes musicales.
-- Les tokens OAuth ne sont JAMAIS exposés directement au client mobile.
-- Cette table est accessible uniquement au backend via SUPABASE_SERVICE_ROLE_KEY.

create table if not exists music_provider_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('apple_music', 'spotify', 'deezer', 'youtube_music', 'soundcloud', 'tidal')),
  provider_user_id text,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, provider)
);

alter table music_provider_connections enable row level security;
-- Intentionnellement aucune policy client : le service_role backend bypass RLS.

create index if not exists idx_music_provider_connections_profile
  on music_provider_connections(profile_id, provider);

create trigger trg_music_provider_connections_updated_at before update on music_provider_connections
  for each row execute function set_updated_at();
