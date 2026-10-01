-- Harden legacy Loki chat RPCs that remain in the schema for migration compatibility.
-- The current mobile app uses keep_agora_messages_v5 / keep_agora_post_message_v4,
-- which are already authenticated-only. Room directory metadata stays public.

revoke execute on function public.keep_agora_messages(text,bigint,integer) from public, anon;
grant execute on function public.keep_agora_messages(text,bigint,integer) to authenticated;

revoke execute on function public.keep_agora_messages_v2(text,bigint,integer) from public, anon;
grant execute on function public.keep_agora_messages_v2(text,bigint,integer) to authenticated;

revoke execute on function public.keep_agora_messages_v3(text,bigint,integer) from public, anon;
grant execute on function public.keep_agora_messages_v3(text,bigint,integer) to authenticated;

revoke execute on function public.keep_agora_messages_v4(text,bigint,integer) from public, anon;
grant execute on function public.keep_agora_messages_v4(text,bigint,integer) to authenticated;

revoke execute on function public.keep_agora_post_message(text,text) from public, anon;
grant execute on function public.keep_agora_post_message(text,text) to authenticated;

revoke execute on function public.keep_agora_report_message(bigint,text) from public, anon;
grant execute on function public.keep_agora_report_message(bigint,text) to authenticated;

revoke execute on function public.keep_agora_notify_direct_message() from public, anon;
