create or replace function public.keep_push_token_register_v3(
  p_token text,
  p_platform text default 'unknown'::text,
  p_app_version text default null::text,
  p_build_number text default null::text,
  p_device_model text default null::text,
  p_os_version text default null::text,
  p_expo_project_id text default null::text,
  p_native_token text default null::text,
  p_native_token_type text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  normalized_platform text := lower(coalesce(nullif(trim(p_platform), ''), 'unknown'));
  clean_token text := trim(coalesce(p_token, ''));
  clean_native text := nullif(trim(coalesce(p_native_token, '')), '');
  clean_native_type text := lower(coalesce(nullif(trim(p_native_token_type), ''), normalized_platform));
  row_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(clean_token) < 10 then raise exception 'PUSH_TOKEN_REQUIRED'; end if;
  if not (
    clean_token like 'ExpoPushToken[%]'
    or clean_token like 'ExponentPushToken[%]'
  ) or right(clean_token, 1) <> ']' then
    raise exception 'PUSH_TOKEN_INVALID';
  end if;

  if normalized_platform not in ('ios','android','unknown') then
    normalized_platform := 'unknown';
  end if;
  if clean_native is not null and length(clean_native) < 16 then
    clean_native := null;
  end if;

  if clean_native is not null then
    delete from public.push_tokens
    where profile_id = uid
      and platform = normalized_platform
      and native_token = clean_native
      and token <> clean_token;
  end if;

  update public.push_tokens
  set profile_id = uid,
      platform = normalized_platform,
      app_version = nullif(trim(coalesce(p_app_version, '')), ''),
      build_number = nullif(trim(coalesce(p_build_number, '')), ''),
      device_model = nullif(trim(coalesce(p_device_model, '')), ''),
      os_version = nullif(trim(coalesce(p_os_version, '')), ''),
      expo_project_id = nullif(trim(coalesce(p_expo_project_id, '')), ''),
      native_token = coalesce(clean_native, native_token),
      native_token_type = case when clean_native is not null then clean_native_type else native_token_type end,
      native_token_updated_at = case when clean_native is not null then now() else native_token_updated_at end,
      updated_at = now()
  where token = clean_token
  returning id into row_id;

  if row_id is null then
    insert into public.push_tokens(
      profile_id, token, platform, app_version, build_number, device_model, os_version, expo_project_id,
      native_token, native_token_type, native_token_updated_at, updated_at
    )
    values(
      uid, clean_token, normalized_platform,
      nullif(trim(coalesce(p_app_version, '')), ''),
      nullif(trim(coalesce(p_build_number, '')), ''),
      nullif(trim(coalesce(p_device_model, '')), ''),
      nullif(trim(coalesce(p_os_version, '')), ''),
      nullif(trim(coalesce(p_expo_project_id, '')), ''),
      clean_native,
      case when clean_native is not null then clean_native_type else null end,
      case when clean_native is not null then now() else null end,
      now()
    )
    on conflict(profile_id, token) do update set
      platform = excluded.platform,
      app_version = excluded.app_version,
      build_number = excluded.build_number,
      device_model = excluded.device_model,
      os_version = excluded.os_version,
      expo_project_id = excluded.expo_project_id,
      native_token = coalesce(excluded.native_token, public.push_tokens.native_token),
      native_token_type = coalesce(excluded.native_token_type, public.push_tokens.native_token_type),
      native_token_updated_at = case when excluded.native_token is not null then now() else public.push_tokens.native_token_updated_at end,
      updated_at = now()
    returning id into row_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', row_id,
    'platform', normalized_platform,
    'nativeTokenStored', clean_native is not null
  );
end
$function$;
