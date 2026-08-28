-- Super Admin user directory is callable only by authenticated sessions.
-- The function itself also verifies that auth.uid() belongs to an active
-- admin_users row, but removing PUBLIC/anon EXECUTE keeps the boundary explicit.
revoke execute on function public.admin_user_directory() from public;
revoke execute on function public.admin_user_directory() from anon;
grant execute on function public.admin_user_directory() to authenticated;
