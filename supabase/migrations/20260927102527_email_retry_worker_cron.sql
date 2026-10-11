create extension if not exists pg_net with schema extensions;

do $worker_secret$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='keep_email_retry_worker_key'
  limit 1;

  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_email_retry_worker_key','KEEP internal email retry worker cron key',null);
  end if;

  insert into public.keep_internal_worker_secrets(name,secret_hash,updated_at)
  values(
    'email-retry-worker',
    encode(extensions.digest(convert_to(v_secret,'UTF8'),'sha256'),'hex'),
    now()
  )
  on conflict(name) do update
  set secret_hash=excluded.secret_hash,updated_at=now();
end
$worker_secret$;

select cron.unschedule(jobid)
from cron.job
where jobname='keep-email-retry-every-5-minutes';

select cron.schedule(
  'keep-email-retry-every-5-minutes',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url:='https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-email-retry-queue',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-keep-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='keep_email_retry_worker_key' limit 1)
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=20000
    ) as request_id;
  $cron$
);
