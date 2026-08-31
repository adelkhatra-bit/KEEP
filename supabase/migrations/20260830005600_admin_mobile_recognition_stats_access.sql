create or replace function public.admin_mobile_recognition_stats(p_hours integer default 168)
returns table(
  platform text,
  provider text,
  attempts bigint,
  matches bigint,
  match_rate numeric,
  avg_latency_ms numeric,
  last_attempt_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid()
      and a.is_active = true
      and a.role in ('SUPER_ADMIN','ADMIN')
  ) then
    raise exception 'admin_required';
  end if;

  return query
  select a.platform,
         a.provider,
         count(*)::bigint,
         count(*) filter (where a.outcome='MATCH')::bigint,
         round(100.0 * count(*) filter (where a.outcome='MATCH') / nullif(count(*),0), 1),
         round(avg(a.latency_ms)::numeric,0),
         max(a.created_at)
  from public.music_recognition_attempts a
  where a.created_at >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours,168), 2160)))
  group by a.platform,a.provider
  order by a.platform,a.provider;
end;
$$;

revoke all on function public.admin_mobile_recognition_stats(integer) from public;
grant execute on function public.admin_mobile_recognition_stats(integer) to authenticated, service_role;
