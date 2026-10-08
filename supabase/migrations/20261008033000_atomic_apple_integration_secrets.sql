create or replace function public.service_set_apple_integration_secret(
  p_key text,
  p_value text,
  p_key_id text,
  p_updated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_key_id_field text;
begin
  if p_key is null or p_key not in ('APPLE_MUSICKIT_PRIVATE_KEY', 'APPLE_IAP_PRIVATE_KEY')
     or p_key_id is null or p_key_id !~ '^[A-Z0-9]{10}$' then
    raise exception 'invalid_apple_integration';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('keep-apple-integration|' || p_key, 0));
  v_category := case when p_key = 'APPLE_MUSICKIT_PRIVATE_KEY' then 'music' else 'payments' end;
  v_key_id_field := pg_catalog.replace(p_key, '_PRIVATE_KEY', '_KEY_ID');

  perform public.service_set_integration_secret(
    p_key, v_category, p_value, 'Clé ' || p_key_id, p_updated_by
  );
  perform public.service_set_integration_secret(
    v_key_id_field, v_category, p_key_id,
    pg_catalog.left(p_key_id, 3) || '••••••' || pg_catalog.right(p_key_id, 4), p_updated_by
  );
end;
$$;

revoke all on function public.service_set_apple_integration_secret(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.service_set_apple_integration_secret(text, text, text, uuid) to service_role;
