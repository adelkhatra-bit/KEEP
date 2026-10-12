-- Prevent a signed-in event creator from self-approving an event
-- with the public.events owner-write RLS policy. Moderator decisions run
-- through the existing trusted service-role RPC.
-- Preserve legitimate creation, cancellation and creator edits.
create or replace function public.keep_event_restrict_client_approval()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $fn$
begin
  if auth.role() in ('authenticated','anon') then
    if TG_OP = 'INSERT' then
      if new.moderation_status::text = 'APPROVED'
        or new.photo_status::text = 'APPROVED'
        or new.text_status::text = 'APPROVED'
        or new.moderated_by is not null
      then
        raise exception 'EVENT_ADMIN_APPROVAL_REQUIRED' using errcode='42501';
      end if;
    else
      if (new.moderation_status::text = 'APPROVED' and old.moderation_status::text is distinct from 'APPROVED')
        or (new.photo_status::text = 'APPROVED' and old.photo_status::text is distinct from 'APPROVED')
        or (new.text_status::text = 'APPROVED' and old.text_status::text is distinct from 'APPROVED')
        or (new.moderated_by is not null and new.moderated_by is distinct from old.moderated_by)
      then
        raise exception 'EVENT_ADMIN_APPROVAL_REQUIRED' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$fn$;

revoke execute on function public.keep_event_restrict_client_approval() from public, anon, authenticated;
drop trigger if exists trg_keep_event_restrict_client_approval on public.events;
create trigger trg_keep_event_restrict_client_approval
before insert or update on public.events
for each row execute function public.keep_event_restrict_client_approval();

comment on function public.keep_event_restrict_client_approval()
is 'No self-approval via owner write RLS. Only trusted service role may apply APPROVED and moderated_by.';