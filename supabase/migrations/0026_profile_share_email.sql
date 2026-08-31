create table if not exists public.profile_share_emails (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  provider text not null default 'brevo',
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create index if not exists profile_share_emails_sender_created_idx
  on public.profile_share_emails(sender_profile_id, created_at desc);

alter table public.profile_share_emails enable row level security;
revoke all on public.profile_share_emails from anon, authenticated;
