-- KEEP Super Admin: deleting an auth user must remove that user's profile and
-- all owned data. Historical/admin rows that merely reference the user must not
-- block the auth.users -> profiles ON DELETE CASCADE.
--
-- Some installations contain newer optional audit/source columns than a clean
-- historical migration replay. Every adjustment is therefore conditional so
-- the same migration is safe both on production and from a blank database.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='integration_secrets' AND column_name='updated_by'
  ) THEN
    ALTER TABLE public.integration_secrets DROP CONSTRAINT IF EXISTS integration_secrets_updated_by_fkey;
    ALTER TABLE public.integration_secrets ADD CONSTRAINT integration_secrets_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='keep_decisions' AND column_name='source_user_id'
  ) THEN
    ALTER TABLE public.keep_decisions DROP CONSTRAINT IF EXISTS keep_decisions_source_user_id_fkey;
    ALTER TABLE public.keep_decisions ADD CONSTRAINT keep_decisions_source_user_id_fkey
      FOREIGN KEY (source_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='operating_costs' AND column_name='created_by'
  ) THEN
    ALTER TABLE public.operating_costs DROP CONSTRAINT IF EXISTS operating_costs_created_by_fkey;
    ALTER TABLE public.operating_costs ADD CONSTRAINT operating_costs_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='router_config_versions' AND column_name='created_by'
  ) THEN
    ALTER TABLE public.router_config_versions DROP CONSTRAINT IF EXISTS router_config_versions_created_by_fkey;
    ALTER TABLE public.router_config_versions ADD CONSTRAINT router_config_versions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A deleted user's moderation report is no longer useful as an attributable
-- user action. Keep the report record for moderation history but anonymise it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='event_reports' AND column_name='reported_by'
  ) THEN
    ALTER TABLE public.event_reports ALTER COLUMN reported_by DROP NOT NULL;
    ALTER TABLE public.event_reports DROP CONSTRAINT IF EXISTS event_reports_reported_by_fkey;
    ALTER TABLE public.event_reports ADD CONSTRAINT event_reports_reported_by_fkey
      FOREIGN KEY (reported_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
