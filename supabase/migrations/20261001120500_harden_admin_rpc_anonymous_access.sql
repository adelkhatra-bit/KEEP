-- Super Admin hardening: no admin RPC is callable anonymously.
-- Authenticated grants remain explicit for the admin UI; service_role remains untouched.
revoke execute on function public.admin_dashboard_signup_detail(date,text) from public, anon;
revoke execute on function public.admin_event_pending_count() from public, anon;
revoke execute on function public.admin_has_role(uuid,text[]) from public, anon;
revoke execute on function public.admin_mobile_recognition_stats(integer) from public, anon;
revoke execute on function public.admin_pending_support_count() from public, anon;
revoke execute on function public.admin_set_feature_flag_test_bypass(uuid,text,boolean) from public, anon;
revoke execute on function public.admin_set_follower_count_override(uuid,integer) from public, anon;

grant execute on function public.admin_dashboard_signup_detail(date,text) to authenticated, service_role;
grant execute on function public.admin_event_pending_count() to authenticated, service_role;
grant execute on function public.admin_has_role(uuid,text[]) to authenticated, service_role;
grant execute on function public.admin_mobile_recognition_stats(integer) to authenticated, service_role;
grant execute on function public.admin_pending_support_count() to authenticated, service_role;
grant execute on function public.admin_set_feature_flag_test_bypass(uuid,text,boolean) to authenticated, service_role;
grant execute on function public.admin_set_follower_count_override(uuid,integer) to authenticated, service_role;
