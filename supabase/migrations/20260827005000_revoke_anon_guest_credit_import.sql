-- KEEP security hardening: this SECURITY DEFINER function relies on auth.uid()
-- and is only useful after a real account session exists. Do not expose it to
-- anon/PUBLIC through PostgREST.
revoke execute on function public.keep_import_guest_credit_usage(integer) from public;
revoke execute on function public.keep_import_guest_credit_usage(integer) from anon;
grant execute on function public.keep_import_guest_credit_usage(integer) to authenticated;
