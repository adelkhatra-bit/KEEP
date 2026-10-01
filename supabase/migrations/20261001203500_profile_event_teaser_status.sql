-- Public profile event teaser.
-- Exposes only counts plus IDs of already-approved relevant events.
-- Pending events never leak title/date/place/photo before Super Admin approval.
create or replace function public.keep_profile_event_teaser(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  with relevant as (
    select e.id,e.moderation_status,e.starts_at
    from public.events e
    where e.creator_id=p_profile_id
      and coalesce(e.is_disabled,false)=false
      and e.starts_at >= now()-interval '12 hours'
      and e.moderation_status in ('APPROVED','PENDING')
  )
  select jsonb_build_object(
    'approvedCount',count(*) filter(where moderation_status='APPROVED'),
    'pendingCount',count(*) filter(where moderation_status='PENDING'),
    'approvedEventIds',coalesce(
      jsonb_agg(id order by starts_at) filter(where moderation_status='APPROVED'),
      '[]'::jsonb
    )
  )
  from relevant;
$function$;

revoke all on function public.keep_profile_event_teaser(uuid) from public;
grant execute on function public.keep_profile_event_teaser(uuid) to anon, authenticated;
