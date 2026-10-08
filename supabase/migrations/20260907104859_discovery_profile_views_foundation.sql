-- Reconstruction idempotente d'une fondation présente en production mais
-- absente de l'historique Git. Nécessaire pour qu'un replay depuis une base
-- vide atteigne correctement 20260907104900_rls_wrap_auth_uid_for_performance.sql.

create table if not exists public.discovery_profile_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  constraint discovery_profile_views_pkey primary key (profile_id, target_profile_id),
  constraint discovery_profile_views_not_self check (profile_id <> target_profile_id)
);

alter table public.discovery_profile_views enable row level security;

drop policy if exists "discovery_profile_views_select_own"
on public.discovery_profile_views;

create policy "discovery_profile_views_select_own"
on public.discovery_profile_views
for select
using (profile_id = (select auth.uid()));
