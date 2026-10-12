-- Auto-publish the organizer's approved event to Story/Pulse once.
-- A moderator must approve first; expired/disabled events never enter the rail.
-- No writes to existing event/transaction rows. Manual "Story 24 h" renewal remains supported.
create or replace function public.keep_auto_share_approved_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.moderation_status::text <> 'APPROVED'
     or coalesce(new.is_disabled,false)
     or coalesce(new.ends_at,new.starts_at + interval '6 hours') <= now() then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.moderation_status::text = 'APPROVED' then
    return new;
  end if;
  insert into public.keep_event_story_shares(event_id,profile_id,created_at)
  values(new.id,new.creator_id,now())
  on conflict(event_id) do nothing;
  return new;
end;
$fn$;
revoke execute on function public.keep_auto_share_approved_event() from public, anon, authenticated;
drop trigger if exists trg_keep_auto_event_story_approved on public.events;
create trigger trg_keep_auto_event_story_approved
after insert or update of moderation_status on public.events
for each row execute function public.keep_auto_share_approved_event();

comment on function public.keep_auto_share_approved_event()
is 'Automatic 24h event Story after human approval, never before. No repetition on edits or existing Stories.';