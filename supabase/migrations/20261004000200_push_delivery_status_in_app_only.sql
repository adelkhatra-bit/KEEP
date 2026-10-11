alter table public.notifications
  drop constraint if exists notifications_push_delivery_status_check;

alter table public.notifications
  add constraint notifications_push_delivery_status_check
  check (push_delivery_status = any (array[
    'CREATED'::text,
    'NO_DEVICE'::text,
    'SENT'::text,
    'DELIVERED'::text,
    'FAILED'::text,
    'IN_APP_ONLY'::text,
    'DISABLED_BY_USER'::text
  ]));
