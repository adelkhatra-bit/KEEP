-- Local additive migration only. Reuse existing health/delivery infrastructure.
alter table public.provider_health
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists incident_open boolean not null default false;

create index if not exists notifications_system_health_admin_idx
  on public.notifications(profile_id,created_at desc) where type='ADMIN_SYSTEM_HEALTH';
create index if not exists email_queue_health_delivery_idx
  on public.email_queue(sent_at desc) where status='sent';

create or replace function public.service_record_system_health(p_results jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_provider text;
  v_status text;
  v_incident boolean;
  v_checked timestamptz;
  v_id uuid;
begin
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 200 then
    raise exception 'invalid_health_batch' using errcode='22023';
  end if;
  -- Stable ordering prevents deadlocks when two worker requests overlap.
  for r in select value from jsonb_array_elements(p_results) order by value->>'provider' loop
    v_provider := r->>'provider';
    v_status := r->>'status';
    v_checked := (r->>'last_checked_at')::timestamptz;
    if v_provider is null or v_provider !~ '^[A-Za-z0-9_.:-]{1,150}$'
      or v_status is null or v_status not in ('OK','ERROR','UNKNOWN')
      or v_checked is null or v_checked > now() + interval '1 minute'
      or (r->>'last_error') !~ '^[A-Z0-9_:.-]{1,120}$' then
      raise exception 'invalid_health_result' using errcode='22023';
    end if;
    insert into public.provider_health(provider) values(v_provider) on conflict do nothing;
    select incident_open into v_incident from public.provider_health
      where provider=v_provider for update;
    -- An old/out-of-order completion must not reopen a recovered incident.
    if exists(select 1 from public.provider_health where provider=v_provider and last_checked_at > v_checked) then
      continue;
    end if;
    if v_status='ERROR' and not v_incident then
      v_id := gen_random_uuid();
      insert into public.notifications(profile_id,type,title,body,data)
      select a.id,'ADMIN_SYSTEM_HEALTH','Incident · ' || v_provider,
        'Le contrôle serveur a détecté une erreur. Consultez la santé système.',
        jsonb_build_object('event','ADMIN_SYSTEM_HEALTH','source','system_health','provider',v_provider,'incidentId',v_id)
      from public.admin_users a join public.profiles p on p.id=a.id
      where a.is_active and a.role in ('SUPER_ADMIN','ADMIN','TECH');
      insert into public.email_queue(recipient_email,subject,html_content,text_content,email_type,user_id,metadata)
      select u.email,'Loki Music · incident serveur',
        '<p>Un contrôle serveur Loki Music a détecté une erreur. Consultez le Super Admin.</p>',
        'Un contrôle serveur Loki Music a détecté une erreur. Consultez le Super Admin.',
        'admin',a.id,jsonb_build_object('source','system_health','provider',v_provider,'incidentId',v_id)
      from public.admin_users a join auth.users u on u.id=a.id
      where a.is_active and a.role in ('SUPER_ADMIN','ADMIN','TECH') and nullif(u.email,'') is not null;
    end if;
    update public.provider_health set status=v_status,
      last_checked_at=v_checked,
      last_error=case when v_status='UNKNOWN' and v_incident then last_error else left(r->>'last_error',120) end,
      latency_ms=greatest(0,least(coalesce((r->>'latency_ms')::int,0),60000)),
      metadata=coalesce(r->'metadata','{}'::jsonb),
      last_success_at=case when v_status='OK' then v_checked else last_success_at end,
      last_failure_at=case when v_status='ERROR' then v_checked else last_failure_at end,
      incident_open=case when v_status='OK' then false when v_status='ERROR' then true else incident_open end
    where provider=v_provider;
  end loop;
end;
$$;
revoke all on function public.service_record_system_health(jsonb) from public, anon, authenticated;
grant execute on function public.service_record_system_health(jsonb) to service_role;

insert into public.provider_health(provider,status,last_error)
select name,'UNKNOWN','NOT_OBSERVED' from unnest(array[
  'ACRCLOUD','BREVO','YOUTUBE','GOOGLE_TRANSLATE','APPLE_MUSIC_TOKEN','EXPO_PUSH',
  'EMAIL_QUEUE','PUSH_QUEUE'
]) as name on conflict(provider) do nothing;

-- Repository catalogue, not a claim that these functions are deployed/healthy.
insert into public.provider_health(provider,status,last_error,metadata)
select 'edge:' || name,'UNKNOWN','EDGE_LOGS_UNAVAILABLE',
  jsonb_build_object('kind','edge','catalogue','repository','reason','Logs Edge indisponibles : aucune santé inférée')
from unnest(array[
  'delete-account','keep-account-email','keep-admin-bootstrap','keep-admin-control',
  'keep-admin-email-policy','keep-admin-preview','keep-admin-user-control','keep-ai-relay',
  'keep-apple-notifications','keep-auth-email','keep-battle-catalog-refresh','keep-battle-catalog-seed',
  'keep-brevo-webhook','keep-creator-actions','keep-email-admin','keep-email-retry-queue',
  'keep-iap-verify','keep-keyless-social','keep-location-resolver','keep-music-core',
  'keep-music-fallback','keep-music-keyless-source','keep-music-memory','keep-music-recognition-v2',
  'keep-music-taxonomy','keep-paddle-webhook','keep-preview','keep-profile-bootstrap',
  'keep-public','keep-pulse-catalog-expand','keep-push-worker','keep-recognition-admin-test',
  'keep-stripe-checkout','keep-stripe-webhook','keep-system-health','keep-ui-translate',
  'keep-username-auth','keep-web-pairing','keep-world-catalog-expand'
]) as name on conflict(provider) do nothing;

create or replace function public.service_collect_system_health()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  j record;
  q record;
  v_no_device bigint;
  v_results jsonb := '[]'::jsonb;
  v_since timestamptz := now()-interval '24 hours';
begin
  -- Health alert delivery must never manufacture another queue incident or
  -- repeatedly recover/reopen one just because its own alert was delivered.
  -- Existing delivery workers still retry these emails/pushes normally.
  select count(*) filter(where status='failed') as failed,
    count(*) filter(where status='pending') as pending,
    count(*) filter(where status='sent' and sent_at >= v_since) as delivered,
    min(created_at) filter(where status='pending') as oldest_pending,
    max(sent_at) filter(where status='sent') as last_delivery,
    count(*) filter(where created_at >= v_since or sent_at >= v_since) as activity
  into q from public.email_queue
  where coalesce(metadata->>'source','') <> 'system_health'
    and not (email_type='admin' and coalesce(metadata,'{}'::jsonb) ? 'incidentId'
      and coalesce(metadata,'{}'::jsonb) ? 'provider');
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'provider','EMAIL_QUEUE',
    'status',case when q.failed>0 or q.oldest_pending < now()-interval '15 minutes' then 'ERROR'
      when q.delivered>0 then 'OK' else 'UNKNOWN' end,
    'last_checked_at',now(),
    'last_error',case when q.failed>0 then 'EMAIL_QUEUE_FAILED'
      when q.oldest_pending < now()-interval '15 minutes' then 'EMAIL_QUEUE_LAG'
      when q.activity=0 and q.pending=0 then 'NO_RECENT_ACTIVITY'
      when q.delivered=0 then 'EMAIL_DELIVERY_NOT_OBSERVED' else null end,
    'metadata',jsonb_build_object('kind','queue','pending',q.pending,'failed',q.failed,
      'delivered_24h',q.delivered,'oldest_pending_at',q.oldest_pending,
      'lag_seconds',ceil(extract(epoch from now()-q.oldest_pending)),
      'last_delivery_at',q.last_delivery,'activity_24h',q.activity,'health_alerts_excluded',true)
  ));
  select count(*) filter(where push_delivery_status='FAILED') as failed,
    count(*) filter(where push_delivery_status='CREATED') as pending,
    count(*) filter(where push_delivery_status in ('SENT','DELIVERED')
      and coalesce(push_delivered_at,pushed_at) >= v_since) as delivered,
    min(created_at) filter(where push_delivery_status='CREATED') as oldest_pending,
    max(coalesce(push_delivered_at,pushed_at)) filter(where push_delivery_status in ('SENT','DELIVERED')) as last_delivery,
    count(*) filter(where created_at >= v_since or pushed_at >= v_since or push_delivered_at >= v_since) as activity
  into q from public.notifications where type <> 'ADMIN_SYSTEM_HEALTH';
  -- Match the delivery diagnostic source, not the denormalized notification
  -- summary. One NO_DEVICE row per notification without a device; this is a
  -- row count, not the sum of retry attempts. Health alerts are excluded here.
  select count(*) into v_no_device from public.push_delivery_attempts a
    join public.notifications n on n.id=a.notification_id
    where a.status='NO_DEVICE' and a.last_attempt_at >= v_since and n.type <> 'ADMIN_SYSTEM_HEALTH';
  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'provider','PUSH_QUEUE',
    'status',case when q.failed>0 or q.oldest_pending < now()-interval '15 minutes' then 'ERROR'
      when q.delivered>0 then 'OK' else 'UNKNOWN' end,
    'last_checked_at',now(),
    'last_error',case when q.failed>0 then 'PUSH_QUEUE_FAILED'
      when q.oldest_pending < now()-interval '15 minutes' then 'PUSH_QUEUE_LAG'
      when v_no_device>0 and q.delivered=0 then 'PUSH_NO_DEVICE'
      when q.activity=0 and q.pending=0 then 'NO_RECENT_ACTIVITY'
      when q.delivered=0 then 'PUSH_DELIVERY_NOT_OBSERVED' else null end,
    'metadata',jsonb_build_object('kind','queue','pending',q.pending,'failed',q.failed,
      'no_device_24h',v_no_device,'no_device_source','push_delivery_attempts.status + last_attempt_at',
      'delivered_24h',q.delivered,'oldest_pending_at',q.oldest_pending,
      'lag_seconds',ceil(extract(epoch from now()-q.oldest_pending)),
      'last_delivery_at',q.last_delivery,'activity_24h',q.activity,'health_alerts_excluded',true,
      'no_device_semantics','No registered device is not proof of provider outage')
  ));
  for j in
    select c.jobid,c.jobname,c.schedule,c.active,d.status,d.end_time,
      (select max(end_time) from cron.job_run_details where jobid=c.jobid and status='succeeded') as last_success,
      (select max(end_time) from cron.job_run_details where jobid=c.jobid and status='failed') as last_failure
    from cron.job c left join lateral (
      select status,end_time from cron.job_run_details where jobid=c.jobid
      order by start_time desc limit 1
    ) d on true
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'provider','cron:' || coalesce(j.jobname,j.jobid::text),
      'status',case when not j.active then 'UNKNOWN' when j.status='failed' then 'ERROR'
        when j.status='succeeded' and j.end_time >= now()-interval '15 minutes' then 'OK' else 'UNKNOWN' end,
      'last_checked_at',now(),
      'last_error',case when not j.active then 'CRON_DISABLED' when j.status='failed' then 'CRON_FAILED'
        when j.status is null then 'CRON_NOT_OBSERVED'
        when j.end_time < now()-interval '15 minutes' then 'CRON_OBSERVATION_STALE' else null end,
      'metadata',jsonb_build_object('kind','cron','schedule',j.schedule,'active',j.active,
        'last_run_status',j.status,'last_run_at',j.end_time,'last_success_at',j.last_success,
        'last_error_at',j.last_failure,'observation','pg_cron history; HTTP enqueue success is not Edge execution success')
    ));
  end loop;
  perform public.service_record_system_health(v_results);
end;
$$;
revoke all on function public.service_collect_system_health() from public, anon, authenticated;
grant execute on function public.service_collect_system_health() to service_role;

create or replace function public.admin_system_health()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_services jsonb; v_daily jsonb; v_notifications jsonb;
begin
  if not exists(select 1 from public.admin_users where id=auth.uid() and is_active
    and role in ('SUPER_ADMIN','ADMIN','TECH')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',provider,
    'status',case when incident_open then 'ERROR'
      when status in ('OK','ok') and last_checked_at >= now()-interval '15 minutes' then 'OK'
      when status in ('ERROR','down','degraded') then 'ERROR' else 'UNKNOWN' end,
    'last_checked_at',last_checked_at,
    'last_error',case when last_error in (
      'PROVIDER_CHECK_FAILED','PROBE_TIMEOUT_OR_FAILURE','QUOTA_EXHAUSTED','NOT_CONFIGURED',
      'NOT_OBSERVED','EDGE_LOGS_UNAVAILABLE','CRON_DISABLED','CRON_FAILED',
      'CRON_NOT_OBSERVED','CRON_OBSERVATION_STALE','EMAIL_QUEUE_FAILED','EMAIL_QUEUE_LAG',
      'NO_RECENT_ACTIVITY','EMAIL_DELIVERY_NOT_OBSERVED','PUSH_QUEUE_FAILED','PUSH_QUEUE_LAG',
      'PUSH_NO_DEVICE','PUSH_DELIVERY_NOT_OBSERVED'
    ) then last_error
      when last_error is not null then 'PROVIDER_CHECK_FAILED' else null end,
    'metadata',jsonb_build_object('last_success_at',last_success_at,'last_failure_at',last_failure_at,
      'incident_open',incident_open,'observation_status',status) || metadata
  ) order by provider),'[]') into v_services from public.provider_health;
  select jsonb_build_object(
    'new_reports',(select count(*) from public.app_problem_reports where created_at >= date_trunc('day',now(),'UTC')),
    'failed_emails',(select count(*) from public.email_queue where status='failed' and created_at >= date_trunc('day',now(),'UTC')),
    -- UTC-day NO_DEVICE delivery rows (last attempt), including admin alerts.
    -- Do not count the notification summary or sum attempt_count retries.
    'push_no_device',(select count(*) from public.push_delivery_attempts
      where status='NO_DEVICE' and last_attempt_at >= date_trunc('day',now(),'UTC')),
    -- Backlog total, including expired WAITING rows: never hide stuck pairings.
    'waiting_qr',(select count(*) from public.web_pairings where status='WAITING')
  ) into v_daily;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'created_at',created_at,'read_at',read_at)
    order by created_at desc),'[]') into v_notifications
    from (select id,title,created_at,read_at from public.notifications
      where profile_id=auth.uid() and type='ADMIN_SYSTEM_HEALTH' order by created_at desc limit 50) n;
  return jsonb_build_object('services',v_services,'daily',v_daily,'notifications',v_notifications);
end;
$$;
revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;

do $worker$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='keep_system_health_worker_key' limit 1;
  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_system_health_worker_key','Internal health worker key',null);
  end if;
  insert into public.keep_internal_worker_secrets(name,secret_hash,updated_at)
  values('system-health-worker',encode(extensions.digest(convert_to(v_secret,'UTF8'),'sha256'),'hex'),now())
  on conflict(name) do update set secret_hash=excluded.secret_hash,updated_at=now();
end;
$worker$;
select cron.unschedule(jobid) from cron.job where jobname='keep-system-health-every-5-minutes';
select cron.schedule('keep-system-health-every-5-minutes','*/5 * * * *',$cron$
  select net.http_post(
    url:='https://rrhqsqzcplvmwxizqnla.supabase.co/functions/v1/keep-system-health',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-keep-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='keep_system_health_worker_key' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=60000);
$cron$);
