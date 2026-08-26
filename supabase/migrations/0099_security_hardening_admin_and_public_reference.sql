-- KEEP security hardening applied to production on 2026-08-26.
-- Keeps public reference reads working while preventing writes from anonymous clients.

alter table public.countries enable row level security;
drop policy if exists countries_public_read on public.countries;
create policy countries_public_read on public.countries
  for select to anon, authenticated using (true);

alter table public.currencies enable row level security;
drop policy if exists currencies_public_read on public.currencies;
create policy currencies_public_read on public.currencies
  for select to anon, authenticated using (true);

alter table public.tax_rules enable row level security;
drop policy if exists tax_rules_public_read on public.tax_rules;
create policy tax_rules_public_read on public.tax_rules
  for select to anon, authenticated using (true);

-- Internal delivery log: service-role only. No client RLS policy on purpose.
alter table public.event_recommendation_sends enable row level security;

-- Pin trigger/function lookup paths to avoid mutable search_path execution.
alter function public.handle_follow_insert() set search_path = public;
alter function public.handle_follow_delete() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.sync_is_adult() set search_path = public;

-- Admin SECURITY DEFINER RPCs must never inherit PostgreSQL's default PUBLIC
-- EXECUTE grant. Authenticated calls still perform their own admin-role checks.
revoke all on function public.admin_integration_runtime_status() from public, anon;
grant execute on function public.admin_integration_runtime_status() to authenticated, service_role;

revoke all on function public.admin_remote_config_list() from public, anon;
grant execute on function public.admin_remote_config_list() to authenticated, service_role;

revoke all on function public.admin_remote_config_set(text,jsonb,text) from public, anon;
grant execute on function public.admin_remote_config_set(text,jsonb,text) to authenticated, service_role;

revoke all on function public.admin_search_profiles(text) from public, anon;
grant execute on function public.admin_search_profiles(text) to authenticated, service_role;

revoke all on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated, service_role;

revoke all on function public.get_my_admin_role() from public, anon;
grant execute on function public.get_my_admin_role() to authenticated, service_role;

revoke all on function public.log_admin_action(text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.log_admin_action(text,text,text,jsonb,jsonb) to authenticated, service_role;
