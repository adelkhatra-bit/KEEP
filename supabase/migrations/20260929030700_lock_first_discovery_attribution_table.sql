-- Lock permanent first-discovery attribution behind server-side functions.
-- The table is written only by keep_capture_first_discovery() and read through
-- keep_track_first_discoveries(uuid[]). Clients must never be able to rewrite
-- the first discoverer directly.
alter table public.keep_track_first_discoveries enable row level security;

revoke all on table public.keep_track_first_discoveries from anon, authenticated;
revoke execute on function public.keep_capture_first_discovery() from public, anon, authenticated;

grant execute on function public.keep_track_first_discoveries(uuid[]) to anon, authenticated;
