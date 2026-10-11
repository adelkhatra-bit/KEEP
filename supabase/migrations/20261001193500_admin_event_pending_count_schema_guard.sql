-- Canonical additive definition for a Super Admin RPC that existed in
-- production before its creation was captured in migration history.
create or replace function public.admin_event_pending_count()
returns integer
language sql
stable
security definer
set search_path to 'public','auth'
as $function$
  select count(*)::integer
  from public.events e
  where e.moderation_status = 'PENDING'
    and e.is_disabled = false
    and public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR']);
$function$;

revoke execute on function public.admin_event_pending_count() from public, anon;
grant execute on function public.admin_event_pending_count() to authenticated, service_role;
