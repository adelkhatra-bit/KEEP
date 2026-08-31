create or replace function public.admin_push_delivery_summary()
returns table(status text, total bigint)
language plpgsql
security definer
set search_path = ''
as $function$
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
  select n.push_delivery_status::text, count(*)::bigint
  from public.notifications n
  group by n.push_delivery_status
  union all
  select 'TOKENS_REGISTERED'::text, count(*)::bigint
  from public.push_tokens
  union all
  select 'ATTEMPTS_24H'::text, count(*)::bigint
  from public.push_delivery_attempts a
  where a.created_at >= now() - interval '24 hours';
end;
$function$;

create or replace function public.admin_push_delivery_recent(p_limit integer default 50)
returns table(
  notification_id uuid,
  username text,
  title text,
  created_at timestamptz,
  delivery_status text,
  attempt_count integer,
  last_error text,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
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
  select
    n.id,
    p.username::text,
    n.title::text,
    n.created_at,
    n.push_delivery_status::text,
    n.push_attempt_count,
    n.push_last_error::text,
    n.push_delivered_at
  from public.notifications n
  left join public.profiles p on p.id = n.profile_id
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$function$;

revoke all on function public.admin_push_delivery_summary() from public, anon;
revoke all on function public.admin_push_delivery_recent(integer) from public, anon;
grant execute on function public.admin_push_delivery_summary() to authenticated;
grant execute on function public.admin_push_delivery_recent(integer) to authenticated;
