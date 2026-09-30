-- KEEP — diffusion Soirées scalable + ciblage d'audience
-- 30/09/2026
-- Une approbation ne fan-out plus des milliers/millions de notifications dans
-- la transaction admin. Elle crée un job, traité par lots idempotents.
-- Le réglage 18+ s'appuie exclusivement sur profiles.is_adult calculé côté
-- backend ; la date de naissance privée n'est jamais exposée.

alter table public.events
  add column if not exists audience_mode text not null default 'GENERAL';

alter table public.events drop constraint if exists events_audience_mode_check;
alter table public.events add constraint events_audience_mode_check
  check (audience_mode in ('GENERAL','ADULTS_18_PLUS','FAMILY'));

create table if not exists public.event_delivery_jobs (
  event_id uuid primary key references public.events(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  processed_count bigint not null default 0,
  message_override text,
  include_rsvp_buttons_override boolean,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists event_delivery_jobs_pending_idx
  on public.event_delivery_jobs(status, created_at);
alter table public.event_delivery_jobs enable row level security;
revoke all on public.event_delivery_jobs from anon, authenticated;

create or replace function public.keep_upcoming_events_for_me(p_limit integer default 100)
returns table(
  id uuid, creator_id uuid, name text, description text, venue_name text,
  starts_at timestamptz, ends_at timestamptz, country_code text,
  dj_artist_names text[], external_ticket_url text, youtube_url text,
  image_url text, image_urls text[], require_qr_code boolean, audience_mode text,
  ticket_price_cents integer, organizer_phone_public text,
  moderation_status text, photo_status text, photo_note text,
  text_status text, text_note text
)
language sql stable security definer set search_path='public','auth' as $$
  with viewer as (
    select p.id, p.is_adult, p.country_code
    from public.profiles p where p.id = auth.uid()
  )
  select
    e.id,e.creator_id,e.name,e.description,e.venue_name,e.starts_at,e.ends_at,e.country_code,
    e.dj_artist_names,e.external_ticket_url,e.youtube_url,e.image_url,e.image_urls,e.require_qr_code,
    e.audience_mode,e.ticket_price_cents,e.organizer_phone_public,e.moderation_status::text,
    e.photo_status::text,e.photo_note,e.text_status::text,e.text_note
  from public.events e
  left join viewer v on true
  where e.is_disabled=false
    and e.moderation_status='APPROVED'
    and e.starts_at >= now() - interval '12 hours'
    and (e.audience_mode <> 'ADULTS_18_PLUS' or coalesce(v.is_adult,false)=true)
  order by
    case
      when auth.uid() is not null and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=e.creator_id) then 0
      when auth.uid() is not null and exists(select 1 from public.keep_decisions k where k.profile_id=auth.uid() and k.source_user_id=e.creator_id and k.decision='KEPT') then 1
      when v.country_code is not null and e.country_code=v.country_code then 2
      else 3
    end,
    e.starts_at asc
  limit least(greatest(coalesce(p_limit,100),1),200);
$$;
revoke all on function public.keep_upcoming_events_for_me(integer) from public;
grant execute on function public.keep_upcoming_events_for_me(integer) to anon, authenticated;

create or replace function public.keep_event_delivery_process_batch(p_batch_size integer default 1000)
returns jsonb
language plpgsql security definer set search_path='public','auth' as $$
declare
  v_job public.event_delivery_jobs%rowtype;
  v_event public.events%rowtype;
  v_creator_username text;
  v_batch integer := least(greatest(coalesce(p_batch_size,1000),1),5000);
  v_sent integer := 0;
begin
  select * into v_job
  from public.event_delivery_jobs
  where status in ('PENDING','PROCESSING')
  order by created_at asc
  for update skip locked
  limit 1;

  if v_job.event_id is null then return jsonb_build_object('ok',true,'idle',true); end if;

  select * into v_event from public.events where id=v_job.event_id;
  if v_event.id is null or v_event.is_disabled or v_event.moderation_status <> 'APPROVED' then
    update public.event_delivery_jobs set status='COMPLETED',completed_at=now(),updated_at=now() where event_id=v_job.event_id;
    return jsonb_build_object('ok',true,'skipped',true,'event_id',v_job.event_id);
  end if;

  select username into v_creator_username from public.profiles where id=v_event.creator_id;
  update public.event_delivery_jobs set status='PROCESSING',updated_at=now(),last_error=null where event_id=v_job.event_id;

  with audience as (
    select follower_id as profile_id from public.follows where followee_id=v_event.creator_id
    union
    select profile_id from public.keep_decisions where source_user_id=v_event.creator_id and decision='KEPT'
  ),
  targets as (
    select a.profile_id
    from audience a
    join public.profiles p on p.id=a.profile_id
    where a.profile_id<>v_event.creator_id
      and (v_event.audience_mode <> 'ADULTS_18_PLUS' or p.is_adult=true)
      and not exists (
        select 1 from public.event_recommendation_sends s
        where s.event_id=v_event.id and s.profile_id=a.profile_id
      )
    order by a.profile_id
    limit v_batch
  ),
  notified as (
    insert into public.notifications(profile_id,type,title,body,data)
    select
      t.profile_id,
      'EVENT_INVITE',
      '@'||coalesce(v_creator_username,'keep-user')||' t''invite à un événement',
      coalesce(v_job.message_override,
        (case when v_event.audience_mode='ADULTS_18_PLUS' then '18+ · ' when v_event.audience_mode='FAMILY' then 'Famille · ' else '' end)
        ||v_event.name||' · '||to_char(v_event.starts_at at time zone 'UTC','DD/MM/YYYY HH24:MI')
        ||coalesce(' · '||v_event.venue_name,'')
        ||case when v_event.require_qr_code then ' · Présente le QR code à l''arrivée' else '' end
      ),
      case when coalesce(v_job.include_rsvp_buttons_override,v_event.include_rsvp_buttons)
        then jsonb_build_object(
          'event_id',v_event.id,'creator_id',v_event.creator_id,'creator_username',v_creator_username,
          'response_options',jsonb_build_array('GOING','MAYBE','NOT_GOING'),
          'image_url',v_event.image_url,'require_qr_code',v_event.require_qr_code,'audience_mode',v_event.audience_mode
        )
        else jsonb_build_object(
          'event_id',v_event.id,'creator_id',v_event.creator_id,'creator_username',v_creator_username,
          'image_url',v_event.image_url,'require_qr_code',v_event.require_qr_code,'audience_mode',v_event.audience_mode
        )
      end
    from targets t
    returning profile_id
  ),
  marked as (
    insert into public.event_recommendation_sends(event_id,profile_id,sent_at)
    select v_event.id,n.profile_id,now() from notified n
    on conflict (event_id,profile_id) do nothing
    returning 1
  )
  select count(*) into v_sent from marked;

  update public.event_delivery_jobs
  set processed_count=processed_count+v_sent,
      status=case when v_sent < v_batch then 'COMPLETED' else 'PENDING' end,
      completed_at=case when v_sent < v_batch then now() else null end,
      updated_at=now()
  where event_id=v_event.id;

  return jsonb_build_object('ok',true,'event_id',v_event.id,'sent',v_sent,'done',v_sent<v_batch);
exception when others then
  if v_job.event_id is not null then
    update public.event_delivery_jobs set status='PENDING',last_error=sqlerrm,updated_at=now() where event_id=v_job.event_id;
  end if;
  return jsonb_build_object('ok',false,'error',sqlerrm);
end;
$$;
revoke all on function public.keep_event_delivery_process_batch(integer) from public,anon,authenticated;
grant execute on function public.keep_event_delivery_process_batch(integer) to service_role;

create or replace function public.admin_event_decide_field(
  p_event_id uuid,
  p_admin_id uuid,
  p_field text,
  p_decision text,
  p_note text default null,
  p_notify_field boolean default true
)
returns jsonb
language plpgsql security definer set search_path='public' as $$
declare
  v_event record;
  v_new_photo public.event_moderation_status;
  v_new_text public.event_moderation_status;
  v_overall public.event_moderation_status;
  v_was_approved boolean;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_field_label text;
begin
  if not exists(select 1 from public.admin_users where id=p_admin_id and is_active=true) then raise exception 'admin_required'; end if;
  if p_field not in ('photo','text') then raise exception 'invalid_field'; end if;
  if p_decision not in ('APPROVE','REJECT') then raise exception 'invalid_decision'; end if;

  select * into v_event from public.events where id=p_event_id;
  if v_event.id is null then raise exception 'event_not_found'; end if;

  v_was_approved := v_event.moderation_status='APPROVED';
  v_new_photo := v_event.photo_status;
  v_new_text := v_event.text_status;
  if p_field='photo' then
    v_new_photo := case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end;
  else
    v_new_text := case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end;
  end if;

  v_overall := case
    when v_new_photo='REJECTED' or v_new_text='REJECTED' then 'REJECTED'
    when v_new_photo='APPROVED' and v_new_text='APPROVED' then 'APPROVED'
    else 'PENDING'
  end;

  update public.events set
    photo_status=v_new_photo,
    photo_note=case when p_field='photo' then v_note else photo_note end,
    text_status=v_new_text,
    text_note=case when p_field='text' then v_note else text_note end,
    moderation_status=v_overall,
    moderated_by=p_admin_id,
    moderated_at=now()
  where id=p_event_id;

  v_field_label := case when p_field='photo' then 'la photo' else 'le texte' end;

  if p_decision='REJECT' and p_notify_field then
    insert into public.notifications(profile_id,type,title,body,data)
    values(
      v_event.creator_id,
      'EVENT_FIELD_REJECTED',
      case when p_field='photo' then 'Photo refusée' else 'Texte refusé' end||' · '||v_event.name,
      coalesce(v_note,'Le Super Admin a refusé '||v_field_label||' de ton événement. Modifie-le et il repartira en validation.'),
      jsonb_build_object('event_id',v_event.id,'field',p_field)
    );
  end if;

  if v_overall='APPROVED' and not v_was_approved then
    insert into public.notifications(profile_id,type,title,body,data)
    values(
      v_event.creator_id,
      'EVENT_APPROVED',
      'Événement approuvé',
      '« '||v_event.name||' » est maintenant visible. La diffusion ciblée à ta communauté est en cours.',
      jsonb_build_object('event_id',v_event.id)
    );

    insert into public.event_delivery_jobs(event_id,status,processed_count,updated_at,completed_at,last_error)
    values(v_event.id,'PENDING',0,now(),null,null)
    on conflict(event_id) do update set status='PENDING',processed_count=0,updated_at=now(),completed_at=null,last_error=null;
  end if;

  return jsonb_build_object('ok',true,'sent',0,'queued',v_overall='APPROVED' and not v_was_approved,'overall',v_overall::text);
end;
$$;
revoke all on function public.admin_event_decide_field(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_event_decide_field(uuid,uuid,text,text,text,boolean) to service_role;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='keep-event-delivery-batches';
select cron.schedule(
  'keep-event-delivery-batches',
  '30 seconds',
  $cron$ select public.keep_event_delivery_process_batch(1000); $cron$
);
