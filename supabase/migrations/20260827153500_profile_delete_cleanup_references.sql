-- KEEP Super Admin: deleting an auth user must remove that user's profile and
-- all owned data. Historical/admin rows that merely reference the user must not
-- block the auth.users -> profiles ON DELETE CASCADE.

alter table public.integration_secrets
  drop constraint if exists integration_secrets_updated_by_fkey,
  add constraint integration_secrets_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.keep_decisions
  drop constraint if exists keep_decisions_source_user_id_fkey,
  add constraint keep_decisions_source_user_id_fkey
    foreign key (source_user_id) references public.profiles(id) on delete set null;

alter table public.operating_costs
  drop constraint if exists operating_costs_created_by_fkey,
  add constraint operating_costs_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.router_config_versions
  drop constraint if exists router_config_versions_created_by_fkey,
  add constraint router_config_versions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

-- A deleted user's moderation report is no longer useful as an attributable
-- user action. Keep the report record for moderation history but anonymise it.
alter table public.event_reports alter column reported_by drop not null;
alter table public.event_reports
  drop constraint if exists event_reports_reported_by_fkey,
  add constraint event_reports_reported_by_fkey
    foreign key (reported_by) references public.profiles(id) on delete set null;
