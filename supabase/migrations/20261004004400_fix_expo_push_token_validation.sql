-- Fix Expo push token validation.
-- The previous PostgreSQL regexp was double-escaped and rejected valid
-- ExpoPushToken[...] values emitted by TestFlight builds.
create or replace function public.keep_push_token_register_v2(
  p_token text,
  p_platform text default 'unknown'::text,
  p_app_version text default null::text,
  p_build_number text default null::text,
  p_device_model text default null::text,
  p_os_version text default null::text,
  p_expo_project_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  normalized_platform text:=lower(coalesce(nullif(trim(p_platform),''),'unknown'));
  clean_token text:=trim(coalesce(p_token,''));
  row_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(clean_token)<10 then raise exception 'PUSH_TOKEN_REQUIRED'; end if;

  if not (
    clean_token like 'ExpoPushToken[%]'
    or clean_token like 'ExponentPushToken[%]'
  ) or right(clean_token,1) <> ']' then
    raise exception 'PUSH_TOKEN_INVALID';
  end if;

  if normalized_platform not in ('ios','android','unknown') then
    normalized_platform:='unknown';
  end if;

  delete from public.push_tokens where token=clean_token and profile_id<>uid;

  insert into public.push_tokens(
    profile_id,token,platform,app_version,build_number,device_model,os_version,expo_project_id,updated_at
  )
  values(
    uid,clean_token,normalized_platform,
    nullif(trim(coalesce(p_app_version,'')),''),
    nullif(trim(coalesce(p_build_number,'')),''),
    nullif(trim(coalesce(p_device_model,'')),''),
    nullif(trim(coalesce(p_os_version,'')),''),
    nullif(trim(coalesce(p_expo_project_id,'')),''),
    now()
  )
  on conflict(profile_id,token) do update set
    platform=excluded.platform,
    app_version=excluded.app_version,
    build_number=excluded.build_number,
    device_model=excluded.device_model,
    os_version=excluded.os_version,
    expo_project_id=excluded.expo_project_id,
    updated_at=now()
  returning id into row_id;

  return jsonb_build_object(
    'ok',true,'id',row_id,'platform',normalized_platform,
    'appVersion',nullif(trim(coalesce(p_app_version,'')),''),
    'buildNumber',nullif(trim(coalesce(p_build_number,'')),'')
  );
end
$function$;
