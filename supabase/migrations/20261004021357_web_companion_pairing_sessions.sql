create table if not exists public.web_pairings (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'WAITING' check (status in ('WAITING','APPROVED','CLAIMED','EXPIRED','CANCELLED')),
  device_label text,
  approved_user_id uuid references auth.users(id) on delete cascade,
  action_link text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  claimed_at timestamptz
);

create index if not exists web_pairings_status_expires_idx
  on public.web_pairings(status, expires_at);
create index if not exists web_pairings_user_idx
  on public.web_pairings(approved_user_id, created_at desc);

alter table public.web_pairings enable row level security;
revoke all on table public.web_pairings from anon, authenticated;
grant all on table public.web_pairings to service_role;

create table if not exists public.web_companion_sessions (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null unique references public.web_pairings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists web_companion_sessions_user_active_idx
  on public.web_companion_sessions(user_id, revoked_at, created_at desc);

alter table public.web_companion_sessions enable row level security;
revoke all on table public.web_companion_sessions from anon, authenticated;
grant all on table public.web_companion_sessions to service_role;

comment on table public.web_pairings is
  'Short-lived Loki Music desktop QR pairing challenges. No user password or refresh token is stored.';
comment on table public.web_companion_sessions is
  'App-level registry of paired desktop sessions used for remote sign-out and device visibility.';
