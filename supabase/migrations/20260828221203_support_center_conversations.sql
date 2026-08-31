create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'OTHER' check (category in ('TECHNICAL','ACCOUNT','RECOGNITION','PAYMENT','SAFETY','IDEA','OTHER')),
  subject text not null check (char_length(subject) between 3 and 140),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  app_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_tickets_profile_idx on public.support_tickets(profile_id, last_message_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, last_message_at desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('USER','ADMIN','SYSTEM')),
  body text not null check (char_length(body) between 1 and 5000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at asc);

create or replace function public.touch_support_ticket_from_message()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.support_tickets
  set last_message_at = new.created_at,
      updated_at = new.created_at,
      status = case when new.sender_role='ADMIN' then 'WAITING_USER' when status in ('RESOLVED','CLOSED') then 'OPEN' else status end
  where id = new.ticket_id;
  return new;
end; $$;

drop trigger if exists trg_touch_support_ticket_from_message on public.support_ticket_messages;
create trigger trg_touch_support_ticket_from_message
after insert on public.support_ticket_messages
for each row execute function public.touch_support_ticket_from_message();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists support_tickets_owner_select on public.support_tickets;
drop policy if exists support_tickets_owner_insert on public.support_tickets;
drop policy if exists support_tickets_admin_update on public.support_tickets;
drop policy if exists support_messages_participant_select on public.support_ticket_messages;
drop policy if exists support_messages_user_insert on public.support_ticket_messages;
drop policy if exists support_messages_admin_insert on public.support_ticket_messages;

create policy support_tickets_owner_select on public.support_tickets for select using (profile_id = auth.uid() or public.is_admin(auth.uid()));
create policy support_tickets_owner_insert on public.support_tickets for insert with check (profile_id = auth.uid());
create policy support_tickets_admin_update on public.support_tickets for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy support_messages_participant_select on public.support_ticket_messages for select using (
  exists (select 1 from public.support_tickets t where t.id=ticket_id and (t.profile_id=auth.uid() or public.is_admin(auth.uid())))
);
create policy support_messages_user_insert on public.support_ticket_messages for insert with check (
  sender_role='USER' and sender_profile_id=auth.uid() and exists (select 1 from public.support_tickets t where t.id=ticket_id and t.profile_id=auth.uid())
);
create policy support_messages_admin_insert on public.support_ticket_messages for insert with check (
  public.is_admin(auth.uid()) and sender_role in ('ADMIN','SYSTEM')
);

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
