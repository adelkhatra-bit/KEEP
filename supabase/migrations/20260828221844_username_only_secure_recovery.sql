create table if not exists public.account_recovery_methods (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  recovery_code_hash text not null,
  device_secret_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  last_recovery_at timestamptz
);

create table if not exists public.account_recovery_events (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete cascade,
  method text not null check (method in ('DEVICE','RECOVERY_CODE','ROTATE','BOOTSTRAP')),
  success boolean not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_recovery_events_profile_idx on public.account_recovery_events(profile_id, created_at desc);

alter table public.account_recovery_methods enable row level security;
alter table public.account_recovery_events enable row level security;
revoke all on public.account_recovery_methods from anon, authenticated;
revoke all on public.account_recovery_events from anon, authenticated;
