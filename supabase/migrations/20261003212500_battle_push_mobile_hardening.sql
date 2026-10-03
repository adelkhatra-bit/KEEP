-- Loki Music mobile hardening — 2026-10-03
-- 1) Battle invitations expire quickly (90 s max).
-- 2) ACCEPTED / DECLINED Battle acknowledgements are intentionally silent.
-- 3) Push tokens carry native build metadata so TestFlight incidents can be traced.

create or replace function public.keep_battle_pending_requires_decision()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status = 'PENDING' then
    new.expires_at := least(
      coalesce(new.expires_at, now() + interval '90 seconds'),
      now() + interval '90 seconds'
    );
  end if;
  return new;
end;
$function$;

create or replace function public.keep_notifications_skip_duplicate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_key text;
begin
  -- Product rule: accepting/refusing a Battle changes the live Battle state
  -- but must not create another notification/push.
  if upper(coalesce(new.type,'')) in ('BATTLE_CHALLENGE_ACCEPTED','BATTLE_CHALLENGE_DECLINED') then
    return null;
  end if;

  new_key := public.keep_notification_semantic_key(new.type,new.data,new.title,new.body);
  if exists (
    select 1
    from public.notifications n
    where n.profile_id=new.profile_id
      and n.type=new.type
      and n.created_at > now()-interval '30 minutes'
      and public.keep_notification_semantic_key(n.type,n.data,n.title,n.body)=new_key
  ) then
    return null;
  end if;
  return new;
end;
$function$;

delete from public.notifications
where type in ('BATTLE_CHALLENGE_ACCEPTED','BATTLE_CHALLENGE_DECLINED');

alter table public.push_tokens
  add column if not exists app_version text,
  add column if not exists build_number text,
  add column if not exists device_model text,
  add column if not exists os_version text,
  add column if not exists expo_project_id text;

create or replace function public.keep_push_token_register_v2(
  p_token text,
  p_platform text default 'unknown',
  p_app_version text default null,
  p_build_number text default null,
  p_device_model text default null,
  p_os_version text default null,
  p_expo_project_id text default null
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
  if clean_token !~ '^(Exponent|Expo)PushToken\\[.+\\]$' then raise exception 'PUSH_TOKEN_INVALID'; end if;
  if normalized_platform not in ('ios','android','unknown') then normalized_platform:='unknown'; end if;

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
end;
$function$;

grant execute on function public.keep_push_token_register_v2(text,text,text,text,text,text,text) to authenticated;
