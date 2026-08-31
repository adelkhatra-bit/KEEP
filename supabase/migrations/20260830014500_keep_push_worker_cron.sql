create extension if not exists pg_net with schema extensions;

create table if not exists public.keep_internal_worker_secrets (
  name text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.keep_internal_worker_secrets enable row level security;
revoke all on table public.keep_internal_worker_secrets from anon, authenticated;
grant select, insert, update, delete on table public.keep_internal_worker_secrets to service_role;

do $worker_secret$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='keep_push_worker_key'
  limit 1;
  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,'keep_push_worker_key','KEEP internal push worker cron key',null);
  end if;
  insert into public.keep_internal_worker_secrets(name,secret_hash,updated_at)
  values('push-worker',encode(extensions.digest(convert_to(v_secret,'UTF8'),'sha256'),'hex'),now())
  on conflict(name) do update set secret_hash=excluded.secret_hash,updated_at=now();
end
$worker_secret$;

create or replace function public.keep_push_claim_batch(p_limit integer default 50)
returns table(id uuid,profile_id uuid,title text,body text,data jsonb,push_attempt_count integer)
language plpgsql
security definer
set search_path='public'
as $function$
begin
  return query
  with picked as (
    select n.id
    from public.notifications n
    where n.pushed_at is null and coalesce(n.push_delivery_status,'CREATED')='CREATED'
    order by n.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), claimed as (
    update public.notifications n
    set pushed_at=now()
    from picked p
    where n.id=p.id
    returning n.id,n.profile_id,n.title,n.body,n.data,coalesce(n.push_attempt_count,0) as push_attempt_count
  )
  select c.id,c.profile_id,c.title,c.body,c.data,c.push_attempt_count from claimed c;
end
$function$;
revoke all on function public.keep_push_claim_batch(integer) from public, anon, authenticated;
grant execute on function public.keep_push_claim_batch(integer) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='keep-push-worker-every-30-seconds';
select cron.schedule(
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
