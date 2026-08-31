create table if not exists public.music_service_connections (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service text not null check (service in ('apple_music','spotify','deezer','youtube_music','soundcloud','tidal')),
  connected_at timestamptz not null default now(),
  primary key (profile_id, service)
);

alter table public.music_service_connections enable row level security;

drop policy if exists music_service_connections_select_own on public.music_service_connections;
create policy music_service_connections_select_own
on public.music_service_connections
for select
to authenticated
using (profile_id = auth.uid());

revoke insert, update, delete on public.music_service_connections from anon, authenticated;
grant select on public.music_service_connections to authenticated;

create or replace function public.keep_music_service_limit(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_plan text;
  v_limit integer;
begin
  if p_uid is null then return 0; end if;
  v_plan := public.keep_active_plan_code(p_uid);

  select case v_plan
    when 'FREE' then coalesce((select value::int from public.remote_config where key='music_services_limit_free' limit 1), 1)
    when 'PREMIUM' then coalesce((select value::int from public.remote_config where key='music_services_limit_premium' limit 1), 3)
    when 'CREATOR_PRO' then coalesce((select value::int from public.remote_config where key='music_services_limit_creator' limit 1), 5)
    when 'VENUE_PRO' then coalesce((select value::int from public.remote_config where key='music_services_limit_venue' limit 1), 6)
    else 1
  end into v_limit;

  return greatest(0, least(6, coalesce(v_limit, 1)));
exception when others then
  return case v_plan when 'PREMIUM' then 3 when 'CREATOR_PRO' then 5 when 'VENUE_PRO' then 6 else 1 end;
end;
$$;

create or replace function public.keep_claim_music_service(p_service text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_service text := lower(trim(coalesce(p_service,'')));
  v_limit integer;
  v_count integer;
  v_plan text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_service not in ('apple_music','spotify','deezer','youtube_music','soundcloud','tidal') then raise exception 'INVALID_SERVICE'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  if exists(select 1 from public.music_service_connections where profile_id=v_uid and service=v_service) then
    v_limit := public.keep_music_service_limit(v_uid);
    select count(*) into v_count from public.music_service_connections where profile_id=v_uid;
    return jsonb_build_object('ok',true,'alreadyConnected',true,'service',v_service,'used',v_count,'limit',v_limit,'plan',public.keep_active_plan_code(v_uid));
  end if;

  v_limit := public.keep_music_service_limit(v_uid);
  select count(*) into v_count from public.music_service_connections where profile_id=v_uid;
  v_plan := public.keep_active_plan_code(v_uid);

  if v_count >= v_limit then
    return jsonb_build_object('ok',false,'error','SERVICE_LIMIT_REACHED','service',v_service,'used',v_count,'limit',v_limit,'plan',v_plan);
  end if;

  insert into public.music_service_connections(profile_id,service) values(v_uid,v_service);
  v_count := v_count + 1;
  return jsonb_build_object('ok',true,'alreadyConnected',false,'service',v_service,'used',v_count,'limit',v_limit,'plan',v_plan);
end;
$$;

grant execute on function public.keep_music_service_limit(uuid) to authenticated;
grant execute on function public.keep_claim_music_service(text) to authenticated;

insert into public.remote_config(key,value)
values
 ('music_services_limit_free','1'),
 ('music_services_limit_premium','3'),
 ('music_services_limit_creator','5'),
 ('music_services_limit_venue','6')
on conflict (key) do nothing;
