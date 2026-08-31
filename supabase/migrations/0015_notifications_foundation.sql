-- KEEP — 0015 : fondation notifications versionnée
-- Ces tables existaient sur le Supabase distant mais leur création n'avait
-- jamais été ajoutée au dépôt. Les migrations doivent pouvoir repartir d'une
-- base PostgreSQL propre, sinon 0024 échoue avant même de créer les push tokens.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_created_idx
  on notifications(profile_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
  for select using (profile_id = auth.uid());

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create table if not exists notification_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  system_enabled boolean not null default true,
  dj_enabled boolean not null default true,
  social_enabled boolean not null default true,
  marketing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists notification_preferences_owner on notification_preferences;
create policy notification_preferences_owner on notification_preferences
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
