-- KEEP production data invariants — READ ONLY
-- Project expected: rrhqsqzcplvmwxizqnla
-- Safe to run before and after a targeted migration.

select
  s.relname as table_name,
  s.n_live_tup::bigint as approx_rows,
  s.n_dead_tup::bigint as approx_dead_rows,
  s.last_analyze,
  s.last_autoanalyze
from pg_stat_user_tables s
where s.schemaname = 'public'
  and (
    s.relname in (
      'profiles','profile_private_info','tracks','keep_decisions','playlists',
      'playlist_tracks','social_links','follows','notifications','events',
      'event_rsvps','subscriptions','download_credit_usage',
      'monthly_free_credit_awards','admin_credit_grants',
      'store_purchase_events','free_credit_audit_log'
    )
    or s.relname like 'keep_battle_%'
    or s.relname like 'playlist_sale_%'
  )
order by s.relname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and (
    c.relname in (
      'profiles','profile_private_info','tracks','keep_decisions','playlists',
      'playlist_tracks','social_links','follows','notifications','events',
      'event_rsvps','subscriptions','download_credit_usage',
      'monthly_free_credit_awards','admin_credit_grants',
      'store_purchase_events','free_credit_audit_log'
    )
    or c.relname like 'keep_battle_%'
    or c.relname like 'playlist_sale_%'
  )
order by c.relname;
