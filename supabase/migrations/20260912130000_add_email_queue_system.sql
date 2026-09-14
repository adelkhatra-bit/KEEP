-- Adel (12/09/2026) : Solution d'automatisation emails
-- Pour éviter que Brevo/Mailjet down bloque l'authentification,
-- on queued les emails en base et on rejoue avec une RPC de retry.
--
-- Architecture:
-- 1. Au lieu de renvoyer 503, on insère dans email_queue
-- 2. Un webhook ou cron Supabase rejoue les emails en pending
-- 3. L'utilisateur n'est jamais bloqué par une panne email externe

create table if not exists public.email_queue (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  sent_at timestamp with time zone,
  retry_count integer default 0,
  max_retries integer default 5,
  status text not null default 'pending', -- pending | sent | failed | skipped
  recipient_email text not null,
  subject text not null,
  html_content text not null,
  text_content text not null,
  email_type text not null, -- signup | recovery | verification | admin
  user_id uuid,
  metadata jsonb default '{}',
  error_message text
);

-- Index pour les queries rapides
create index if not exists email_queue_status_idx on public.email_queue(status, created_at);
create index if not exists email_queue_user_idx on public.email_queue(user_id);
create index if not exists email_queue_type_idx on public.email_queue(email_type);

-- RPC pour rejouer manuellement (Super Admin)
create or replace function public.email_queue_retry_failed()
returns table (total_retried integer, failed_count integer) as $$
declare
  v_retry_count integer := 0;
  v_failed_count integer := 0;
begin
  -- Compter les emails à retraiter
  select count(*)::integer into v_retry_count
  from public.email_queue
  where status = 'failed' and retry_count < max_retries;

  -- Marquer comme pending pour rejouer
  update public.email_queue
  set status = 'pending', error_message = null
  where status = 'failed' and retry_count < max_retries;

  -- Compter ceux qui dépassent les retries
  select count(*)::integer into v_failed_count
  from public.email_queue
  where status = 'failed' and retry_count >= max_retries;

  return query select v_retry_count, v_failed_count;
end;
$$ language plpgsql security definer;

grant execute on function public.email_queue_retry_failed() to authenticated, service_role;

-- RPC pour vérifier le statut d'une inscription
create or replace function public.email_verification_check(p_user_id uuid)
returns table (
  email_verification_pending boolean,
  email_sent boolean,
  email_failed boolean,
  last_attempt timestamp with time zone
) as $$
begin
  return query
  select
    au.user_metadata->>'keep_email_verification_pending' = 'true',
    exists(
      select 1 from public.email_queue
      where user_id = p_user_id
        and email_type = 'signup'
        and status = 'sent'
    ),
    exists(
      select 1 from public.email_queue
      where user_id = p_user_id
        and email_type = 'signup'
        and status = 'failed'
        and retry_count >= max_retries
    ),
    (
      select sent_at from public.email_queue
      where user_id = p_user_id
      order by created_at desc
      limit 1
    )
  from auth.users au
  where au.id = p_user_id;
end;
$$ language plpgsql security definer;

grant execute on function public.email_verification_check(uuid) to authenticated, service_role;
