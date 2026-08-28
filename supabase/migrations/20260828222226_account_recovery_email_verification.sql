create table if not exists public.account_email_verifications (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

create index if not exists account_email_verifications_expires_idx on public.account_email_verifications(expires_at);

alter table public.account_email_verifications enable row level security;
revoke all on public.account_email_verifications from anon, authenticated;
