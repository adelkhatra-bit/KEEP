-- KEEP — 0004: Événements (§26-28), avec anti-spam RSVP (§27)

create type rsvp_status as enum ('GOING', 'MAYBE', 'NOT_GOING');

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text,
  country_code char(2) references countries(code),
  approx_lat double precision,
  approx_lng double precision,
  dj_artist_names text[] not null default '{}',
  playlist_id uuid references playlists(id), -- playlist de la soirée
  external_ticket_url text,
  is_flagged boolean not null default false, -- modération
  is_disabled boolean not null default false, -- désactivé par un admin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_events_country on events(country_code);
create index if not exists idx_events_starts_at on events(starts_at);

create table if not exists event_rsvps (
  event_id uuid not null references events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status rsvp_status not null,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Anti-spam (§27) : au lieu d'une notification cascade à tous les followers,
-- le RecommendationEngine écrit ici les cibles retenues, avec dédup + limite.
create table if not exists event_recommendation_sends (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  relevance_score numeric,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, profile_id) -- déduplication garantie au niveau base
);

create table if not exists event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reported_by uuid not null references profiles(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create trigger trg_events_updated_at before update on events
  for each row execute function set_updated_at();
