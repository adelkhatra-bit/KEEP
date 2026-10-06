-- The direct anti-harassment limit is enforced centrally inside
-- public.keep_agora_post_message_v2. Keep this migration idempotent and remove
-- the temporary duplicate trigger used during the live rollout.

drop trigger if exists trg_keep_agora_direct_three_message_guard
  on public.music_agora_messages;

drop function if exists public.keep_agora_direct_three_message_guard();
