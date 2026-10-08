-- Reconstruction idempotente d'une fondation présente en production mais
-- absente de l'historique Git. Elle est requise par les quotas et par
-- 20260907104900_rls_wrap_auth_uid_for_performance.sql.

create table if not exists public.feature_usage_counters (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  period_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  constraint feature_usage_counters_pkey primary key (profile_id, feature_key, period_key)
);

alter table public.feature_usage_counters enable row level security;

drop policy if exists "feature_usage_counters_select_own"
on public.feature_usage_counters;

create policy "feature_usage_counters_select_own"
on public.feature_usage_counters
for select
using (profile_id = (select auth.uid()));
