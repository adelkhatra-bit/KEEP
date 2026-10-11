-- Rejouabilité des migrations (10/10/2026) : la production possède déjà ces deux colonnes sur story_watch_sessions
-- (playback_progress jsonb, playback_revision integer not null default 0) mais AUCUNE migration du dépôt ne les créait ;
-- `keep_my_story_viewers_v4` (20261008010713) échouait donc sur une base neuve (CI « verify » : column "playback_progress" does not exist).
-- Idempotent et non destructif : en production il ne fait rien (colonnes déjà présentes, mêmes types que la base réelle).
alter table public.story_watch_sessions add column if not exists playback_progress jsonb;
alter table public.story_watch_sessions add column if not exists playback_revision integer not null default 0;
