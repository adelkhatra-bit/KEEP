-- Soirées : sépare les invitations réellement reçues des événements publics.
-- Source : event_recommendation_sends, déjà dédupliquée et alimentée par la
-- diffusion par lots après approbation Super Admin.

create or replace function public.keep_my_event_invitation_ids()
returns table(event_id uuid, sent_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.event_id, s.sent_at
  from public.event_recommendation_sends s
  join public.events e on e.id = s.event_id
  where s.profile_id = auth.uid()
    and s.sent_at is not null
    and coalesce(e.is_disabled,false) = false
    and e.moderation_status = 'APPROVED'
    and e.starts_at >= now() - interval '12 hours'
  order by s.sent_at desc
  limit 200;
$$;

revoke all on function public.keep_my_event_invitation_ids() from public, anon, authenticated;
grant execute on function public.keep_my_event_invitation_ids() to authenticated;
