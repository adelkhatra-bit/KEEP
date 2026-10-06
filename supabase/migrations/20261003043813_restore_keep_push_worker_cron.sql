-- Loki Music · restaure la livraison push serveur sans toucher aux données utilisateur.
-- Le worker Edge Function, son secret Vault et le RPC de claim existent déjà en production.
-- Ce garde recrée uniquement le planificateur s'il a disparu.

do $restore$
begin
  if not exists (
    select 1 from cron.job where jobname='keep-push-worker-every-30-seconds'
  ) then
    perform cron.schedule(
      'keep-push-worker-every-30-seconds',
      '30 seconds',
      $cron$
        select net.http_post(
          url:='https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-push-worker',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-keep-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='keep_push_worker_key' limit 1)
          ),
          body:='{}'::jsonb,
          timeout_milliseconds:=20000
        ) as request_id;
      $cron$
    );
  end if;
end
$restore$;
