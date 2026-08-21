-- KEEP — 0005: Rôles Super Admin (§45, §63), feature flags (§57), audit logs (§62)

create type admin_role as enum ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'MARKETING', 'MODERATOR', 'TECH');

create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references admin_users(id),
  action text not null, -- ex. 'plan.price.updated', 'user.suspended'
  target_type text, -- 'profile' | 'plan' | 'subscription' | 'event' | ...
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_actor on audit_logs(actor_admin_id, created_at desc);
create index if not exists idx_audit_logs_target on audit_logs(target_type, target_id);

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- 'compare_keep' | 'events' | 'local_discovery' | 'creator' | 'venue' | ...
  description text,
  is_enabled_globally boolean not null default false,
  enabled_countries char(2)[] not null default '{}',
  enabled_plans plan_code[] not null default '{}',
  rollout_percent int not null default 0 check (rollout_percent between 0 and 100),
  min_app_version text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users(id)
);

create table if not exists remote_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users(id)
);

create table if not exists provider_health (
  provider text primary key, -- 'spotify' | 'appleMusic' | 'audd' | 'acrcloud' | 'supabase' | 'push' | 'email'
  status text not null default 'unknown', -- 'ok' | 'degraded' | 'down' | 'unknown'
  last_error text,
  last_checked_at timestamptz,
  latency_ms int
);

create trigger trg_feature_flags_updated_at before update on feature_flags
  for each row execute function set_updated_at();
