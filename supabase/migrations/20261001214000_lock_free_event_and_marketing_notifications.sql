-- Free accounts receive Loki event/marketing promotion by default.
-- Only Creator Pro / Venue Pro may opt out, matching the mobile settings UI.
create or replace function public.keep_lock_required_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_plan text;
begin
  v_plan := coalesce(public.keep_active_plan_code(new.profile_id),'FREE');
  if v_plan not in ('CREATOR_PRO','VENUE_PRO') then
    new.events_enabled := true;
    new.marketing_enabled := true;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_keep_lock_required_notification_preferences
on public.notification_preferences;

create trigger trg_keep_lock_required_notification_preferences
before insert or update of events_enabled,marketing_enabled,profile_id
on public.notification_preferences
for each row
execute function public.keep_lock_required_notification_preferences();

revoke all on function public.keep_lock_required_notification_preferences() from public,anon,authenticated;
grant execute on function public.keep_lock_required_notification_preferences() to service_role;
