alter table public.notifications
  add column if not exists push_delivery_status text not null default 'CREATED',
  add column if not exists push_attempt_count integer not null default 0,
  add column if not exists push_last_error text,
  add column if not exists push_delivered_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_push_delivery_status_check;
alter table public.notifications
  add constraint notifications_push_delivery_status_check
  check (push_delivery_status in ('CREATED','NO_DEVICE','SENT','DELIVERED','FAILED'));

update public.notifications
set push_delivery_status = case when pushed_at is null then 'CREATED' else 'SENT' end
where push_delivery_status = 'CREATED';

create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id uuid not null,
  push_token_id uuid references public.push_tokens(id) on delete set null,
  token_suffix text,
  status text not null default 'CREATED' check (status in ('CREATED','NO_DEVICE','SENT','DELIVERED','FAILED')),
  expo_ticket_id text,
  attempt_count integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  receipt_checked_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_delivery_attempts enable row level security;

create unique index if not exists push_delivery_attempts_notification_token_uidx
  on public.push_delivery_attempts(notification_id, push_token_id)
  where push_token_id is not null;
create unique index if not exists push_delivery_attempts_no_device_uidx
  on public.push_delivery_attempts(notification_id)
  where push_token_id is null and status = 'NO_DEVICE';
create index if not exists push_delivery_attempts_ticket_idx
  on public.push_delivery_attempts(expo_ticket_id)
  where expo_ticket_id is not null;
create index if not exists push_delivery_attempts_status_idx
  on public.push_delivery_attempts(status, last_attempt_at);
create index if not exists notifications_push_delivery_status_idx
  on public.notifications(push_delivery_status, created_at desc);

comment on table public.push_delivery_attempts is 'Per-device Expo push ticket and receipt lifecycle. Service role only by RLS.';
comment on column public.notifications.push_delivery_status is 'Summary state: CREATED, NO_DEVICE, SENT, DELIVERED, FAILED.';
