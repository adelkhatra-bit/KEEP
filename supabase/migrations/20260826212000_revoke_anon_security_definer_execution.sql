-- Supabase advisor hardening: les fonctions trigger ne sont pas des RPC publics,
-- les fonctions utilisateur exigent une session et la limitation reconnaissance
-- reste réservée au service backend.

revoke execute on function public.handle_follow_delete() from public, anon, authenticated;
revoke execute on function public.handle_follow_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_follow() from public, anon, authenticated;
revoke execute on function public.keep_create_profile_from_auth_user() from public, anon, authenticated;

revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

revoke execute on function public.keep_download_credit_status() from public, anon;
revoke execute on function public.keep_consume_download_credit() from public, anon;
grant execute on function public.keep_download_credit_status() to authenticated, service_role;
grant execute on function public.keep_consume_download_credit() to authenticated, service_role;

revoke execute on function public.request_social_link(uuid,text) from public, anon;
grant execute on function public.request_social_link(uuid,text) to authenticated, service_role;

revoke execute on function public.service_allow_recognition(text,integer,integer) from public, anon, authenticated;
grant execute on function public.service_allow_recognition(text,integer,integer) to service_role;
