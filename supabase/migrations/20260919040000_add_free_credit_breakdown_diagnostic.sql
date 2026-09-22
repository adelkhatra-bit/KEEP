-- Diagnostic RPC pour tester chaque composante de keep_free_credit_breakdown()
-- Chaque appel de fonction est wrappé dans un BEGIN/EXCEPTION pour capturer les erreurs exactes

create or replace function public.keep_free_credit_breakdown_diagnostic()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  uid uuid := auth.uid();
  diagnostic jsonb := '{}'::jsonb;
begin
  if uid is null then
    return jsonb_build_object('error', 'AUTH_REQUIRED', 'uid', null);
  end if;

  diagnostic := diagnostic || jsonb_build_object('uid', uid::text);

  -- Test 1: keep_referral_free_credit_bonus_for_profile
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'referral_bonus',
      public.keep_referral_free_credit_bonus_for_profile(uid)
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'referral_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  -- Test 2: keep_monthly_free_bonus_for_profile
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'monthly_bonus',
      public.keep_monthly_free_bonus_for_profile(uid)
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'monthly_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  -- Test 3: keep_admin_credit_grant_total_for_profile
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'admin_grant',
      public.keep_admin_credit_grant_total_for_profile(uid)
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'admin_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  -- Test 4: keep_chargeable_keep_count
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'chargeable_count',
      public.keep_chargeable_keep_count(uid)
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'chargeable_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  -- Test 5: keep_theoretical_free_credit_remaining_for_profile
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'theoretical_remaining',
      public.keep_theoretical_free_credit_remaining_for_profile(uid)
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'theoretical_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  -- Test 6: Essayer la fonction complète
  begin
    diagnostic := diagnostic || jsonb_build_object(
      'full_breakdown',
      public.keep_free_credit_breakdown()
    );
  exception when others then
    diagnostic := diagnostic || jsonb_build_object(
      'full_error',
      jsonb_build_object('message', SQLERRM, 'code', SQLSTATE)
    );
  end;

  return diagnostic;
end;
$function$;

grant execute on function public.keep_free_credit_breakdown_diagnostic() to authenticated, anon;
