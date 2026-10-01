-- Scale the private-room people picker for large profile counts.
-- Prefix/substring search uses ILIKE '%...%', so btree username indexes are not enough.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_profiles_public_username_trgm
  on public.profiles using gin (username extensions.gin_trgm_ops)
  where is_public = true;

create index if not exists idx_profiles_public_display_name_trgm
  on public.profiles using gin ((coalesce(display_name,'')) extensions.gin_trgm_ops)
  where is_public = true;
