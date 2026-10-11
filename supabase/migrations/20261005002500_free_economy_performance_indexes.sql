-- Économie FREE 04/10/2026 — indexes ajoutés après Supabase Performance Advisor.
create index if not exists idx_keep_iap_consumable_transactions_product
  on public.keep_iap_consumable_transactions(product_id);

create index if not exists idx_keep_first_discovery_credit_keeper
  on public.keep_first_discovery_credit_events(keeper_profile_id);

create index if not exists idx_keep_first_discovery_credit_track
  on public.keep_first_discovery_credit_events(track_id);
