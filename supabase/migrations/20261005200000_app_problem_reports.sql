-- Signalement de problème depuis l'app (secouer le téléphone / Réglages). Additif uniquement.
create table if not exists public.app_problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  username text,
  message text not null check (char_length(message) between 3 and 2000),
  screen text,
  platform text,
  os_version text,
  device text,
  app_version text,
  build_sha text,
  status text not null default 'NEW',
  created_at timestamptz not null default now()
);
alter table public.app_problem_reports enable row level security;
drop policy if exists app_problem_reports_insert_own on public.app_problem_reports;
create policy app_problem_reports_insert_own on public.app_problem_reports
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists app_problem_reports_select_own on public.app_problem_reports;
create policy app_problem_reports_select_own on public.app_problem_reports
  for select to authenticated using (user_id = auth.uid());
create index if not exists app_problem_reports_created_idx on public.app_problem_reports (created_at desc);
