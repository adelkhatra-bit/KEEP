-- Groupes calculés sur les rapports existants, sans copie ni modification historique.
create or replace function public.keep_problem_report_group_key(p_screen text, p_message text)
returns text language sql immutable set search_path = public as $function$
  select md5(jsonb_build_array(
    lower(trim(coalesce(p_screen, ''))),
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p_message, '')),
          'https?://[^[:space:]]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ' variable ', 'g'),
        '\m[0-9]{4,}\M', ' n ', 'g'),
      '[[:space:][:punct:]]+', ' ', 'g'))
  )::text);
$function$;

create or replace function public.admin_problem_report_groups(p_status text default 'NEW', p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $function$
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return coalesce((
    with reports as (
      select r.*, public.keep_problem_report_group_key(r.screen, r.message) as group_key
      from public.app_problem_reports r
    ), groups as (
      select group_key, count(*) as report_count, max(created_at) as latest_at,
        case when bool_or(status = 'NEW') then 'NEW'
             when bool_or(status = 'SEEN') then 'SEEN'
             when bool_and(status in ('FIXED','NEEDS_UPDATE')) then 'FIXED'
             else min(status) end as group_status
      from reports group by group_key
    ), bounded as (
      select * from groups
      where p_status is null or p_status = 'ALL' or group_status = p_status
      order by report_count desc, latest_at desc, group_key
      limit greatest(1, least(coalesce(p_limit, 300), 500))
    )
    select jsonb_agg(jsonb_build_object(
      'group_key', g.group_key, 'report_count', g.report_count,
      'id', r.id, 'created_at', g.latest_at, 'kind', r.kind,
      'status', g.group_status, 'message', r.message, 'screen', r.screen,
      'platform', r.platform, 'app_version', r.app_version,
      'fixed_in_sha', r.fixed_in_sha, 'regression_test_path', r.regression_test_path
    ) order by g.report_count desc, g.latest_at desc, g.group_key)
    from bounded g
    cross join lateral (
      select * from reports r where r.group_key = g.group_key
      order by r.created_at desc, r.id limit 1
    ) r
  ), '[]'::jsonb);
end;
$function$;

-- L'ensemble est atomique : les gardes SHA/test des RPC historiques restent actifs.
create or replace function public.admin_problem_report_group_set_status(
  p_group_key text, p_status text, p_sha text default null, p_test text default null
)
returns integer language plpgsql security definer set search_path = public as $function$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('NEW','SEEN','FIXED') then raise exception 'INVALID_STATUS'; end if;
  if p_group_key is null or p_group_key !~ '^[0-9a-f]{32}$' then raise exception 'INVALID_GROUP'; end if;
  for v_id in
    select r.id from public.app_problem_reports r
    where public.keep_problem_report_group_key(r.screen, r.message) = p_group_key
    order by r.id for update
  loop
    if p_status = 'FIXED' then
      perform public.admin_problem_report_record_fix(v_id, p_sha, p_test);
    else
      perform public.admin_problem_report_set_status(v_id, p_status);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.keep_problem_report_group_key(text, text) from public, anon, authenticated;
revoke all on function public.admin_problem_report_groups(text, integer) from public, anon;
revoke all on function public.admin_problem_report_group_set_status(text, text, text, text) from public, anon;
grant execute on function public.admin_problem_report_groups(text, integer) to authenticated;
grant execute on function public.admin_problem_report_group_set_status(text, text, text, text) to authenticated;
