-- Découple la publication d'un morceau public de la diffusion à ses abonnés.
-- La transaction utilisateur n'insère plus une notification par follower :
-- elle dépose un seul job, traité ensuite par lots avec pg_cron.

create table if not exists public.public_track_notification_fanout_jobs (
  decision_id uuid primary key references public.keep_decisions(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_username text,
  track_id text not null,
  audience_cutoff timestamptz not null default now(),
  last_follower_id uuid,
  processed_count bigint not null default 0 check (processed_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_track_notification_fanout_pending_idx
  on public.public_track_notification_fanout_jobs(completed_at, created_at)
  where completed_at is null;

alter table public.public_track_notification_fanout_jobs enable row level security;
revoke all on table public.public_track_notification_fanout_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.public_track_notification_fanout_jobs to service_role;

create or replace function public.notify_followers_on_public_keep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if new.decision <> 'KEPT' or new.visibility <> 'PUBLIC' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.decision = 'KEPT'
     and old.visibility = 'PUBLIC' then
    return new;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = new.profile_id;

  insert into public.public_track_notification_fanout_jobs(
    decision_id,
    owner_profile_id,
    owner_username,
    track_id,
    audience_cutoff,
    last_follower_id,
    processed_count,
    attempt_count,
    completed_at,
    updated_at
  )
  values (
    new.id,
    new.profile_id,
    v_username,
    new.track_id,
    now(),
    null,
    0,
    0,
    null,
    now()
  )
  on conflict (decision_id) do update
  set owner_profile_id = excluded.owner_profile_id,
      owner_username = excluded.owner_username,
      track_id = excluded.track_id,
      audience_cutoff = excluded.audience_cutoff,
      last_follower_id = null,
      processed_count = 0,
      attempt_count = 0,
      completed_at = null,
      updated_at = now();

  return new;
end;
$$;

revoke all on function public.notify_followers_on_public_keep() from public, anon, authenticated;
grant execute on function public.notify_followers_on_public_keep() to service_role;

create or replace function public.keep_process_public_track_notification_fanout(
  p_jobs integer default 20,
  p_batch integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.public_track_notification_fanout_jobs%rowtype;
  v_recipient_count integer;
  v_notification_count integer;
  v_last_follower uuid;
  v_total integer := 0;
begin
  p_jobs := greatest(1, least(coalesce(p_jobs, 20), 100));
  p_batch := greatest(100, least(coalesce(p_batch, 1000), 5000));

  for v_job in
    select j.*
    from public.public_track_notification_fanout_jobs j
    where j.completed_at is null
    order by j.created_at asc
    limit p_jobs
    for update skip locked
  loop
    if not exists (
      select 1
      from public.keep_decisions kd
      where kd.id = v_job.decision_id
        and kd.profile_id = v_job.owner_profile_id
        and kd.decision = 'KEPT'
        and kd.visibility = 'PUBLIC'
    ) then
      update public.public_track_notification_fanout_jobs
      set completed_at = now(), updated_at = now(), attempt_count = attempt_count + 1
      where decision_id = v_job.decision_id;
      continue;
    end if;

    with recipients as materialized (
      select f.follower_id
      from public.follows f
      left join public.notification_preferences np
        on np.profile_id = f.follower_id
      where f.followee_id = v_job.owner_profile_id
        and f.created_at <= v_job.audience_cutoff
        and (v_job.last_follower_id is null or f.follower_id > v_job.last_follower_id)
        and coalesce(np.social_enabled, true) = true
      order by f.follower_id
      limit p_batch
    ),
    new_sends as (
      insert into public.profile_music_notification_sends(decision_id, follower_id)
      select v_job.decision_id, r.follower_id
      from recipients r
      on conflict do nothing
      returning follower_id
    ),
    created_notifications as (
      insert into public.notifications(profile_id, type, title, body, data)
      select
        s.follower_id,
        'NEW_PUBLIC_KEEP',
        'Nouveau morceau chez @' || coalesce(nullif(v_job.owner_username, ''), 'Loki'),
        'Titre masqué · écoute l’extrait et garde-le pour découvrir le titre.',
        jsonb_build_object(
          'ownerProfileId', v_job.owner_profile_id,
          'username', v_job.owner_username,
          'trackId', v_job.track_id,
          'decisionId', v_job.decision_id,
          'masked', true,
          'kind', 'new_public_keep'
        )
      from new_sends s
      returning profile_id
    )
    select
      (select count(*)::integer from recipients),
      (select max(follower_id) from recipients),
      (select count(*)::integer from created_notifications)
    into v_recipient_count, v_last_follower, v_notification_count;

    v_total := v_total + coalesce(v_notification_count, 0);

    update public.public_track_notification_fanout_jobs
    set last_follower_id = coalesce(v_last_follower, last_follower_id),
        processed_count = processed_count + coalesce(v_recipient_count, 0),
        attempt_count = attempt_count + 1,
        completed_at = case when coalesce(v_recipient_count, 0) < p_batch then now() else null end,
        updated_at = now()
    where decision_id = v_job.decision_id;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.keep_process_public_track_notification_fanout(integer, integer) from public, anon, authenticated;
grant execute on function public.keep_process_public_track_notification_fanout(integer, integer) to service_role;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname = 'loki-public-track-fanout'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'loki-public-track-fanout',
  '* * * * *',
  'select public.keep_process_public_track_notification_fanout(20, 1000);'
);
