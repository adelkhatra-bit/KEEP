-- KEEP 2026-08-27
-- Formalise dans les migrations les colonnes utilisées par les cadeaux
-- Super Admin. Elles existaient déjà sur le projet Supabase de production,
-- mais pas dans une base reconstruite depuis zéro (CI / nouvel environnement).

alter table public.subscriptions
  add column if not exists source text,
  add column if not exists granted_by uuid references public.admin_users(id) on delete set null,
  add column if not exists grant_reason text;

create index if not exists subscriptions_admin_grant_lookup_idx
  on public.subscriptions(profile_id, source, status);
