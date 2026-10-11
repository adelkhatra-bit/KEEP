-- Lot n°5 — notifications fiables, maîtrisées, rapides (décisions d'Adel du 05/10/2026).
-- 1) Statut CAPPED_IN_APP : alerte téléphone plafonnée (8/jour/profil), la
--    notification reste visible dans l'app.
-- 2) remote_config.push_daily_cap (réglable depuis le Super Admin).
-- 3) Envoi immédiat : un trigger par instruction réveille keep-push-worker
--    (anti-rafale 2 s). Le cron de 30 s reste le filet de sécurité.
-- Aucune donnée utilisateur n'est supprimée ni modifiée.

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
    'DISABLED_BY_USER'::text,
    'SUPPRESSED_DUPLICATE'::text,
    'CAPPED_IN_APP'::text
  ]));

insert into public.remote_config(key, value, description, updated_at)
values ('push_daily_cap', '8'::jsonb, 'Nombre maximal d''alertes téléphone par profil et par 24 h (messages directs et argent exemptés).', now())
on conflict (key) do nothing;

create table if not exists public.keep_push_kick_state (
  id boolean primary key default true check (id),
  last_kick timestamptz not null default 'epoch'
);
insert into public.keep_push_kick_state(id) values (true) on conflict (id) do nothing;
alter table public.keep_push_kick_state enable row level security;
revoke all on public.keep_push_kick_state from public, anon, authenticated;

create or replace function public.keep_push_kick_after_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $kick$
declare
  v_key text;
  v_fire boolean := false;
begin
  -- Anti-rafale : au plus un réveil toutes les 2 secondes, atomique.
  update public.keep_push_kick_state
     set last_kick = now()
   where id and last_kick < now() - interval '2 seconds'
  returning true into v_fire;
  if not coalesce(v_fire, false) then return null; end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'keep_push_worker_key' limit 1;
  if v_key is null then return null; end if;

  perform net.http_post(
    url := 'https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-push-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-keep-worker-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  -- Un réveil raté ne doit jamais empêcher la création de la notification.
  return null;
end;
$kick$;

revoke all on function public.keep_push_kick_after_notification_insert() from public, anon, authenticated;

drop trigger if exists trg_keep_push_kick_after_notification_insert on public.notifications;
create trigger trg_keep_push_kick_after_notification_insert
  after insert on public.notifications
  for each statement execute function public.keep_push_kick_after_notification_insert();
