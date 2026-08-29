-- Super Admin calls this RPC with an authenticated Supabase session.
-- Keep the function SECURITY DEFINER and enforce admin_users inside the function,
-- while allowing authenticated clients to execute it.
revoke all on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated, service_role;
