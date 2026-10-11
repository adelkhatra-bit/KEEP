-- Make the global Loki Messenger surface contract complete for future accounts.
-- Only backfill profiles that still use the historical untouched default.

alter table public.profiles
  alter column community_chat_surfaces
  set default array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[];

update public.profiles
set community_chat_surfaces = array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']::text[]
where community_chat_surfaces = array['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']::text[];
