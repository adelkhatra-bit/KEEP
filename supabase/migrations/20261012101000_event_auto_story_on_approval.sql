-- Loki Music: an approved live event is automatically promoted as a 24-hour Story.
-- Reuse the existing moderated event-story feed and its RSVP/Pulse scoring.
-- Idempotent: no duplicate Story when moderators re-save an approved event.
create or replace function public.keep_auto_publish_event_story_on_approval()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  if new.moderation_status::text <> 'APPROVED'
     or coalesce(new.is_disabled, false)
     or coalesce(new.ends_at, new.starts_at + interval '6 hours') <= now() then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.moderation_status::text = 'APPROVED' then
    return new;
  end if;

  insert into public.keep_event_story_shares(event_id, profile_id, created_at)
  values (new.id, new.creator_id, now())
  on conflict(event_id) do nothing;
  return new;
end;
$fn$;

revoke all on function public.keep_auto_publish_event_story_on_approval() from public, anon, authenticated;

drop trigger if exists keep_auto_event_story_approval on public.events;
create trigger keep_auto_event_story_approval
after insert or update of moderation_status on public.events
for each row execute function public.keep_auto_publish_event_story_on_approval();

comment on function public.keep_auto_publish_event_story_on_approval()
is 'Approved, active event automatically gets exactly one 24-hour Story. No bypass of event moderation or audience privacy.';
