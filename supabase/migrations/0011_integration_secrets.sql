-- KEEP — 0011: coffre de configuration des intégrations.
-- Les valeurs sont chiffrées côté backend AVANT insertion.
-- Aucun client mobile/web ne reçoit jamais le secret en clair.

create table if not exists integration_secrets (
  key text primary key,
  category text not null,
  encrypted_value text not null,
  value_hint text,
  is_configured boolean not null default true,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table integration_secrets enable row level security;
-- Pas de policy client. Le backend service_role est le seul lecteur/écrivain.

create index if not exists idx_integration_secrets_category on integration_secrets(category);
