-- KEEP BATTLE Arena — socle relationnel manquant dans l'historique Git.
-- Reproduit le schéma actuellement déployé afin qu'une base neuve puisse
-- appliquer les migrations Battle sociales de façon déterministe.

create table if not exists public.keep_battle_themes (
  code text primary key,
  label text not null,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.keep_battle_themes(code,label,enabled,sort_order)
values
  ('MIX','Mix surprise',true,0),
  ('RAP_FR','Rap français',true,10),
  ('RAP_US','Rap US',true,20),
  ('FUNK','Funk',true,25),
  ('JAZZ','Jazz',true,27),
  ('DISCO','Disco',true,29),
  ('AFRO','Afro / Afrobeats',true,30),
  ('CHANSON_FR','Chanson française',true,31),
  ('SOUL','Soul',true,33),
  ('REGGAE','Reggae',true,35),
  ('ANNEES_80','Années 80',true,37),
  ('ANNEES_90','Années 90',true,39),
  ('ELECTRO','Electro',true,40),
  ('POP','Pop',true,50),
  ('RNB','R&B',true,60),
  ('ROCK','Rock',true,70),
  ('LATINO','Latino',true,80),
  ('RAI','Raï / Maghreb',true,90),
  ('CLASSIQUE','Classique',true,95)
on conflict (code) do nothing;

create table if not exists public.keep_battle_track_themes (
  track_id uuid not null references public.tracks(id) on delete cascade,
  theme_code text not null references public.keep_battle_themes(code) on delete cascade,
  source text not null default 'ADMIN',
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  primary key (track_id, theme_code)
);

create table if not exists public.keep_battle_arenas (
  id uuid primary key default gen_random_uuid(),
  arena_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  host_id uuid not null references public.profiles(id) on delete cascade,
  theme_code text not null default 'MIX' references public.keep_battle_themes(code),
  status text not null default 'WAITING' check (status in ('WAITING','ACTIVE','CLOSED','EXPIRED')),
  max_players smallint not null default 10 check (max_players between 2 and 10),
  round_count smallint not null default 8 check (round_count between 5 and 12),
  match_no integer not null default 1,
  current_round smallint not null default 0,
  round_duration_ms integer not null default 12000 check (round_duration_ms between 4000 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_battle_arena_status_theme on public.keep_battle_arenas(status,theme_code,created_at desc);

create table if not exists public.keep_battle_arena_members (
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  seat_status text not null default 'ACTIVE' check (seat_status in ('ACTIVE','QUEUED','ELIMINATED','LEFT')),
  joined_at timestamptz not null default now(),
  score integer not null default 0,
  correct_predictions integer not null default 0,
  total_response_ms bigint not null default 0,
  placement integer,
  matches_played integer not null default 0,
  primary key (arena_id, profile_id)
);
create index if not exists idx_battle_arena_member_profile on public.keep_battle_arena_members(profile_id,joined_at desc);
create index if not exists idx_battle_arena_member_queue on public.keep_battle_arena_members(arena_id,seat_status,joined_at);

create table if not exists public.keep_battle_arena_rounds (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  match_no integer not null,
  position smallint not null check (position between 1 and 12),
  track_id uuid references public.tracks(id) on delete set null,
  title_snapshot text not null,
  artist_snapshot text not null,
  artwork_url text,
  preview_url text,
  started_at timestamptz,
  closes_at timestamptz,
  majority_decision text check (majority_decision in ('KEEP','PASS','TIE')),
  finalized_at timestamptz,
  choices jsonb not null default '[]'::jsonb,
  reveal_until timestamptz,
  release_year_snapshot smallint,
  unique (arena_id, match_no, position)
);

create table if not exists public.keep_battle_arena_answers (
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  round_id uuid not null references public.keep_battle_arena_rounds(id) on delete cascade,
  match_no integer not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actual_decision text check (actual_decision in ('KEEP','PASS')),
  predicted_majority_decision text check (predicted_majority_decision in ('KEEP','PASS')),
  response_ms integer not null check (response_ms >= 0),
  points integer not null default 0,
  submitted_at timestamptz not null default now(),
  selected_answer text,
  is_correct boolean,
  primary key (round_id, profile_id)
);
create index if not exists idx_battle_arena_answers_match on public.keep_battle_arena_answers(arena_id,match_no,round_id);

create table if not exists public.keep_battle_arena_match_results (
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  match_no integer not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  placement integer not null,
  score integer not null,
  correct_predictions integer not null,
  total_response_ms bigint not null,
  created_at timestamptz not null default now(),
  primary key (arena_id, match_no, profile_id)
);

create table if not exists public.keep_battle_arena_credit_holds (
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  match_no integer not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'LOCKED' check (status in ('LOCKED','SETTLED','RELEASED')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key (arena_id, match_no, profile_id)
);
create index if not exists idx_keep_arena_holds_profile_locked on public.keep_battle_arena_credit_holds(profile_id,status) where status='LOCKED';

create table if not exists public.keep_battle_arena_credit_events (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.keep_battle_arenas(id) on delete cascade,
  match_no integer not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  result text not null check (result in ('WIN','LOSS')),
  amount integer not null,
  created_at timestamptz not null default now(),
  unique (arena_id, match_no, profile_id)
);
create index if not exists idx_keep_arena_credit_events_profile on public.keep_battle_arena_credit_events(profile_id,created_at desc);

alter table public.keep_battle_themes enable row level security;
alter table public.keep_battle_track_themes enable row level security;
alter table public.keep_battle_arenas enable row level security;
alter table public.keep_battle_arena_members enable row level security;
alter table public.keep_battle_arena_rounds enable row level security;
alter table public.keep_battle_arena_answers enable row level security;
alter table public.keep_battle_arena_match_results enable row level security;
alter table public.keep_battle_arena_credit_holds enable row level security;
alter table public.keep_battle_arena_credit_events enable row level security;

-- Ces tables sont volontairement pilotées par les RPC SECURITY DEFINER Battle.
revoke all on public.keep_battle_arenas, public.keep_battle_arena_members,
  public.keep_battle_arena_rounds, public.keep_battle_arena_answers,
  public.keep_battle_arena_match_results, public.keep_battle_arena_credit_holds,
  public.keep_battle_arena_credit_events from anon, authenticated;
