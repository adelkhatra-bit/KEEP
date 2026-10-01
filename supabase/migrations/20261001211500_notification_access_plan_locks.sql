-- Notification access locks by subscription formula.
-- New notification types auto-register unlocked so Super Admin always sees the full live taxonomy.

create table if not exists public.notification_access_rules (
  notification_type text primary key,
  is_locked boolean not null default false,
  min_plan_code public.plan_code not null default 'FREE'::public.plan_code,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_access_rules_type_upper check (notification_type = upper(notification_type))
);

alter table public.notification_access_rules enable row level security;

drop policy if exists notification_access_rules_read on public.notification_access_rules;
create policy notification_access_rules_read
on public.notification_access_rules
for select
to anon, authenticated
using (true);

drop policy if exists notification_access_rules_admin_write on public.notification_access_rules;
create policy notification_access_rules_admin_write
on public.notification_access_rules
for all
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

insert into public.notification_access_rules(notification_type)
select distinct upper(type)
from public.notifications
where nullif(trim(type), '') is not null
on conflict (notification_type) do nothing;

create or replace function public.keep_register_notification_access_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.type), '') is not null then
    insert into public.notification_access_rules(notification_type)
    values (upper(new.type))
    on conflict (notification_type) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_register_notification_access_rule() from public, anon, authenticated;

drop trigger if exists keep_notifications_register_access_rule on public.notifications;
create trigger keep_notifications_register_access_rule
after insert on public.notifications
for each row
execute function public.keep_register_notification_access_rule();
