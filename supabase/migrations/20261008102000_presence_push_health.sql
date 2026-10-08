-- Issue 63 : présence légère, indépendante de l'écran consulté et du choix Battle.
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.keep_profile_presence_ping()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.profiles
  set last_seen_at = now()
  where id = uid and (last_seen_at is null or last_seen_at <= now() - interval '5 minutes');
  if found then
    -- Conserve la disponibilité Battle existante sans lire le profil complet.
    perform public.keep_battle_manual_availability_ping();
  end if;
end;
$function$;
revoke all on function public.keep_profile_presence_ping() from public, anon;
grant execute on function public.keep_profile_presence_ping() to authenticated;

create or replace function public.keep_public_profile_presence(p_profile_id uuid)
returns table(last_seen_at timestamptz, is_online boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(p.last_seen_at, greatest(sp.app_last_seen_at, sp.last_seen_at)),
    coalesce(coalesce(p.last_seen_at, greatest(sp.app_last_seen_at, sp.last_seen_at))
      > now() - interval '5 minutes', false)
  from public.profiles p
  left join public.keep_battle_solo_presence sp on sp.profile_id = p.id
  where p.id = p_profile_id
  limit 1;
$function$;
revoke all on function public.keep_public_profile_presence(uuid) from public;
grant execute on function public.keep_public_profile_presence(uuid) to anon, authenticated;

-- Une installation conserve son identité malgré la rotation APNs/FCM/Expo.
-- Les autres téléphones du même compte ne sont jamais désinscrits.
alter table public.push_tokens add column if not exists device_id text;
create index if not exists push_tokens_device_id_idx on public.push_tokens(device_id)
  where device_id is not null;

create or replace function public.keep_push_token_register_v4(
  p_token text,
  p_device_id text,
  p_platform text default 'unknown',
  p_app_version text default null,
  p_build_number text default null,
  p_device_model text default null,
  p_os_version text default null,
  p_expo_project_id text default null,
  p_native_token text default null,
  p_native_token_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  device text := nullif(trim(p_device_id), '');
  result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if device is null or length(device) < 16 or length(device) > 200 then
    raise exception 'PUSH_DEVICE_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(device, 63));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(trim(p_token), 64));
  -- Effacement technique des enregistrements obsolètes, jamais des notifications.
  delete from public.push_tokens pt
  where (pt.device_id = device and pt.token <> trim(p_token))
    or (pt.token = trim(p_token) and pt.profile_id <> uid);
  result := public.keep_push_token_register_v3(
    p_token, p_platform, p_app_version, p_build_number, p_device_model,
    p_os_version, p_expo_project_id, p_native_token, p_native_token_type
  );
  update public.push_tokens set device_id = device
    where token = trim(p_token) and profile_id = uid;
  return result;
end;
$function$;
revoke all on function public.keep_push_token_register_v4(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.keep_push_token_register_v4(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- Les cartes Santé ont une période commune et renvoient un zéro réel,
-- distinct d'une erreur de lecture. Aucun token n'est exposé au navigateur admin.
create or replace function public.admin_push_delivery_summary()
returns table(status text, total bigint)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active = true
      and a.role in ('SUPER_ADMIN', 'ADMIN')
  ) then raise exception 'admin_required'; end if;
  return query
  select s.status, count(n.id)::bigint
  from (values ('CREATED'), ('NO_DEVICE'), ('SENT'), ('DELIVERED'), ('FAILED')) s(status)
  left join public.notifications n on n.push_delivery_status::text = s.status
    and n.created_at >= now() - interval '24 hours'
  group by s.status
  union all select 'TOKENS_REGISTERED'::text, count(*)::bigint from public.push_tokens
  union all select 'ATTEMPTS_24H'::text, count(*)::bigint
    from public.push_delivery_attempts a where a.created_at >= now() - interval '24 hours';
end;
$function$;
revoke all on function public.admin_push_delivery_summary() from public, anon;
grant execute on function public.admin_push_delivery_summary() to authenticated;
