-- Additive schema guard for Battle Solo progress.
-- Production already contains these fields; IF NOT EXISTS makes this safe and
-- documents the current canonical schema without changing immutable history.
alter table public.keep_battle_solo_presence
  add column if not exists solo_round_index integer,
  add column if not exists solo_round_total integer;
