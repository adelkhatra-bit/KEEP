-- KEEP 2026-08-27 — durcissement conseillé par Supabase Database Advisor.
--
-- Objectif : aucune fonction d'administration SECURITY DEFINER n'est appelable
-- anonymement. Les fonctions trigger restent exclusivement invoquées par
-- PostgreSQL. Les RPC métier qui doivent être appelées par un compte KEEP
-- restent accessibles à authenticated et continuent de vérifier auth.uid()/le
-- rôle administrateur dans leur corps.
--
-- `track_keep_event` reste volontairement utilisable en invité pour les
-- statistiques d'essai gratuit ; elle n'accorde aucun accès aux données métier.

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.admin_dashboard_stats(date,date,text)',
    'public.admin_delete_operating_cost(uuid)',
    'public.admin_finance_report(date,date,text)',
    'public.admin_get_quota_settings()',
    'public.admin_record_operating_cost(text,text,numeric,text,text,text,timestamp with time zone)',
    'public.admin_set_free_credit_rules(integer,integer)',
    'public.admin_set_usage_limit(text,text,integer)',
    'public.admin_user_directory()',
    'public.admin_integration_runtime_status()',
    'public.admin_remote_config_list()',
    'public.admin_remote_config_set(text,jsonb,text)',
    'public.admin_search_profiles(text)',
    'public.get_my_admin_role()',
    'public.is_admin(uuid)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('revoke execute on function %s from public, anon', signature);
      execute format('grant execute on function %s to authenticated, service_role', signature);
    end if;
  end loop;

  foreach signature in array array[
    'public.enrich_track_from_keep_decision()',
    'public.notify_followers_on_public_keep()',
    'public.keep_notify_admin_grant()',
    'public.keep_notify_follow_change()',
    'public.keep_notify_new_follower()',
    'public.keep_create_profile_from_auth_user()',
    'public.keep_activate_verified_email_profile()'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', signature);
      execute format('grant execute on function %s to service_role', signature);
    end if;
  end loop;

  if to_regprocedure('public.keep_notification_action(text,uuid)') is not null then
    revoke execute on function public.keep_notification_action(text,uuid) from public, anon;
    grant execute on function public.keep_notification_action(text,uuid) to authenticated, service_role;
  end if;
end $$;
