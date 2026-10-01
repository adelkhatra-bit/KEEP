-- Safe profile event spotlight for public profile cards.
-- Pending events expose only a count/status, never private details before approval.
create or replace function public.keep_profile_event_spotlight(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_approved_count integer := 0;
  v_pending_count integer := 0;
  v_next_event_id uuid;
  v_next_starts_at timestamptz;
begin
  if p_profile_id is null then return jsonb_build_object('approvedCount',0,'pendingCount',0); end if;

  select count(*)::integer into v_approved_count
  from public.events e
  where e.creator_id=p_profile_id
    and e.is_disabled=false
    and e.moderation_status='APPROVED'
    and e.starts_at>=now();

  select count(*)::integer into v_pending_count
  from public.events e
  where e.creator_id=p_profile_id
    and e.is_disabled=false
    and e.moderation_status in ('DRAFT','PENDING')
    and e.starts_at>=now();

  select e.id,e.starts_at into v_next_event_id,v_next_starts_at
  from public.events e
  where e.creator_id=p_profile_id
    and e.is_disabled=false
    and e.moderation_status='APPROVED'
    and e.starts_at>=now()
  order by e.starts_at asc
  limit 1;

  return jsonb_build_object(
    'approvedCount',v_approved_count,
    'pendingCount',v_pending_count,
    'nextApprovedEventId',v_next_event_id,
    'nextApprovedStartsAt',v_next_starts_at,
    'status',case when v_approved_count>0 then 'APPROVED' when v_pending_count>0 then 'PENDING' else 'NONE' end
  );
end;
$function$;
revoke all on function public.keep_profile_event_spotlight(uuid) from public;
grant execute on function public.keep_profile_event_spotlight(uuid) to anon,authenticated;
