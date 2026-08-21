-- KEEP — 0003: Pays, devises, plans, prix, entitlements, abonnements, paiements
-- Règle absolue : ne jamais mélanger devises/pays. Chaque transaction porte
-- sa propre devise ; aucune somme cross-devise ne doit être calculée en SQL
-- brut (agrégations toujours groupées par currency_code côté application/vues).

create table if not exists countries (
  code char(2) primary key, -- ISO 3166-1 alpha-2
  name text not null,
  default_currency_code char(3) not null,
  is_available boolean not null default false -- piloté depuis Super Admin (§48)
);

create table if not exists currencies (
  code char(3) primary key, -- ISO 4217
  symbol text not null,
  decimal_digits int not null default 2
);

create table if not exists tax_rules (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references countries(code),
  label text not null, -- ex. 'TVA FR 20%'
  rate_percent numeric(5,2) not null,
  applies_to text not null default 'all', -- 'all' | 'subscriptions' | 'one_time'
  created_at timestamptz not null default now()
);

create type plan_code as enum ('FREE', 'PREMIUM', 'CREATOR_PRO', 'VENUE_PRO');
create type billing_period as enum ('MONTHLY', 'YEARLY');

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code plan_code not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  trial_days int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un prix par plan x devise x période — permet un pricing par pays sans dupliquer le plan.
create table if not exists plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  currency_code char(3) not null references currencies(code),
  period billing_period not null,
  amount numeric(12,2) not null,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (plan_id, currency_code, period, effective_from)
);

create table if not exists features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- ex. 'compare_keep', 'events', 'local_discovery', 'creator_analytics'
  name text not null,
  description text
);

create table if not exists plan_entitlements (
  plan_id uuid not null references plans(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  is_enabled boolean not null default true,
  primary key (plan_id, feature_id)
);

-- Quotas administrables (ex. GARDER/mois, profils suivis, comparaisons/mois).
create table if not exists usage_limits (
  plan_id uuid not null references plans(id) on delete cascade,
  limit_key text not null, -- 'keeps_per_month' | 'follows_max' | 'compares_per_month' | ...
  limit_value int, -- null = illimité
  primary key (plan_id, limit_key)
);

create type subscription_status as enum ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
create type payment_channel as enum ('APPLE_IAP', 'GOOGLE_PLAY_BILLING', 'WEB');

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  plan_price_id uuid not null references plan_prices(id),
  channel payment_channel not null,
  status subscription_status not null default 'TRIALING',
  country_code char(2) not null references countries(code),
  currency_code char(3) not null references currencies(code),
  store_original_transaction_id text, -- Apple originalTransactionId / Google purchaseToken
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Anti-mélange devise : la devise de l'abonnement doit être celle du prix souscrit.
  constraint chk_subscription_currency check (true) -- vérifié en trigger ci-dessous (validation cross-table)
);

create or replace function check_subscription_currency()
returns trigger language plpgsql as $$
declare
  price_currency char(3);
begin
  select currency_code into price_currency from plan_prices where id = new.plan_price_id;
  if price_currency is distinct from new.currency_code then
    raise exception 'subscriptions.currency_code (%) doit correspondre à plan_prices.currency_code (%)', new.currency_code, price_currency;
  end if;
  return new;
end;
$$;

create trigger trg_check_subscription_currency
  before insert or update on subscriptions
  for each row execute function check_subscription_currency();

create type transaction_status as enum ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id),
  channel payment_channel not null,
  status transaction_status not null default 'PENDING',
  amount numeric(12,2) not null,
  currency_code char(3) not null references currencies(code),
  country_code char(2) not null references countries(code),
  store_transaction_id text unique,
  store_commission_amount numeric(12,2), -- commission Apple/Google connue/estimée
  tax_amount numeric(12,2),
  raw_receipt jsonb, -- reçu brut (webhook) pour audit — jamais affiché en clair côté Super Admin
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_profile on transactions(profile_id);
create index if not exists idx_transactions_currency on transactions(currency_code);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  amount numeric(12,2) not null,
  currency_code char(3) not null references currencies(code),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  plan_id uuid references plans(id),
  discount_percent numeric(5,2),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true
);

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id) on delete cascade,
  code text not null unique,
  max_redemptions int,
  redemptions_count int not null default 0,
  expires_at timestamptz
);

-- Coûts opérationnels (Supabase, reconnaissance musicale, hosting, ...) — §51.
create table if not exists operating_costs (
  id uuid primary key default gen_random_uuid(),
  category text not null, -- 'supabase' | 'music_recognition' | 'hosting' | 'email' | 'push' | 'analytics' | 'other'
  label text not null,
  amount numeric(12,2) not null,
  currency_code char(3) not null references currencies(code),
  period billing_period not null default 'MONTHLY',
  recorded_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create trigger trg_plans_updated_at before update on plans
  for each row execute function set_updated_at();
create trigger trg_subscriptions_updated_at before update on subscriptions
  for each row execute function set_updated_at();
