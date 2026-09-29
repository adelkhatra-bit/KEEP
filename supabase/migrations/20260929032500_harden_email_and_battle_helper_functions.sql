-- Harden helper functions flagged by the Supabase security advisor.
-- Fixed search_path prevents object-shadowing; email admin helpers are not
-- callable by anonymous clients.
alter function public.keep_battle_skill_tier_rank(text) set search_path = public, pg_temp;
alter function public.keep_battle_solo_max_reward_for_round_count(integer) set search_path = public, pg_temp;
alter function public.email_queue_retry_failed() set search_path = public, pg_temp;
alter function public.email_verification_check(uuid) set search_path = public, pg_temp;

revoke execute on function public.email_queue_retry_failed() from public, anon;
grant execute on function public.email_queue_retry_failed() to authenticated, service_role;

revoke execute on function public.email_verification_check(uuid) from public, anon;
grant execute on function public.email_verification_check(uuid) to authenticated, service_role;
