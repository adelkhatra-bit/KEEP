-- Super Admin hardening: no admin RPC is callable anonymously.
-- Authenticated grants remain explicit for the admin UI; service_role remains untouched.
-- Some historical databases define these helpers in later/additive migrations.
-- A fresh replay must therefore harden only the functions that already exist.

do $$
declare
  sig text;
  fn regprocedure;
begin
  foreach sig in array array[
    'public.admin_dashboard_signup_detail(date,text)',
    'public.admin_event_pending_count()',
    'public.admin_has_role(uuid,text[])',
    'public.admin_mobile_recognition_stats(integer)',
    'public.admin_pending_support_count()',
    'public.admin_set_feature_flag_test_bypass(uuid,text,boolean)',
    'public.admin_set_follower_count_override(uuid,integer)'
  ]
  loop
    fn := to_regprocedure(sig);
    if fn is not null then
      execute format('revoke execute on function %s from public, anon', fn);
      execute format('grant execute on function %s to authenticated, service_role', fn);
    end if;
  end loop;
end;
$$;
