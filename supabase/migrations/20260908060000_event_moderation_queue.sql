-- Adel (08/09/2026) : "il faut on approuve le super admin la photo le
-- texte pour eviter les choses ilegale et il recoit une notification quand
-- c'est approuve ... il faut pas que les utilisateurs voient quoi que ce
-- soit tant que le super admin a pas approuve" -- file d'attente de
-- moderation : un evenement (creation OU modification touchant nom /
-- description / photo) n'est visible au public qu'apres validation.

do $$ begin
  create type public.event_moderation_status as enum ('PENDING','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

alter table public.events
  add column if not exists moderation_status public.event_moderation_status not null default 'PENDING',
  add column if not exists moderation_note text,
  add column if not exists moderated_by uuid references public.profiles(id),
  add column if not exists moderated_at timestamptz,
  -- Adel (08/09/2026) : le choix des boutons de reponse se faisait UNIQUEMENT
  -- au moment du broadcast (event.broadcast), qui partait immediatement a la
  -- creation. La diffusion partant desormais seulement a l'approbation
  -- (admin_event_approve), ce choix doit survivre sur la ligne elle-meme.
  add column if not exists include_rsvp_buttons boolean not null default true;

-- Les evenements deja crees avant ce lot restent visibles tels quels : seuls
-- les NOUVEAUX evenements (et les modifications futures) passent par la
-- moderation.
update public.events set moderation_status = 'APPROVED' where moderation_status = 'PENDING';

create index if not exists idx_events_moderation_status on public.events(moderation_status);

-- File d'attente pour le Super Admin (photo + texte pleinement visibles pour
-- la revue, jamais tronques).
create or replace function public.admin_event_moderation_queue()
returns table(
  id uuid,
  name text,
  description text,
  image_url text,
  starts_at timestamptz,
  venue_name text,
  creator_id uuid,
  creator_username text,
  created_at timestamptz,
  moderation_status text
)
language sql
stable security definer
set search_path = 'public'
as $$
  select e.id, e.name, e.description, e.image_url, e.starts_at, e.venue_name, e.creator_id, p.username, e.created_at, e.moderation_status::text
  from public.events e
  join public.profiles p on p.id = e.creator_id
  where e.moderation_status = 'PENDING' and e.is_disabled = false
  order by e.created_at asc
  limit 200;
$$;
revoke all on function public.admin_event_moderation_queue() from public, anon, authenticated;
grant execute on function public.admin_event_moderation_queue() to service_role;

-- Approuve : rend l'evenement visible, notifie l'organisateur, ET diffuse
-- l'invitation a l'audience (abonnes + personnes ayant deja garde un morceau
-- du createur) -- exactement l'audience et le dedoublonnage (via
-- event_recommendation_sends) deja utilises par event.broadcast. Idempotent
-- par construction : une ré-approbation apres une modification ne renvoie
-- jamais une invitation a quelqu'un qui l'a deja recue.
create or replace function public.admin_event_approve(p_event_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_event record;
  v_sent integer := 0;
begin
  if not exists (select 1 from public.admin_users where id = p_admin_id and is_active = true) then
    raise exception 'admin_required';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'event_not_found'; end if;

  update public.events
  set moderation_status = 'APPROVED', moderated_by = p_admin_id, moderated_at = now(), moderation_note = null
  where id = p_event_id;

  insert into public.notifications(profile_id, type, title, body, data)
  values (
    v_event.creator_id,
    'EVENT_APPROVED',
    'Événement approuvé',
    '« ' || v_event.name || ' » est maintenant visible et a été envoyé à ta communauté.',
    jsonb_build_object('event_id', v_event.id)
  );

  with audience as (
    select follower_id as profile_id from public.follows where followee_id = v_event.creator_id
    union
    select profile_id from public.keep_decisions where source_user_id = v_event.creator_id and decision = 'KEPT'
  ),
  targets as (
    select distinct a.profile_id from audience a
    where a.profile_id <> v_event.creator_id
      and not exists (
        select 1 from public.event_recommendation_sends s
        where s.event_id = v_event.id and s.profile_id = a.profile_id
      )
  ),
  notified as (
    insert into public.notifications(profile_id, type, title, body, data)
    select
      t.profile_id,
      'EVENT_INVITE',
      'Invitation · ' || v_event.name,
      v_event.name || ' · ' || to_char(v_event.starts_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || coalesce(' · ' || v_event.venue_name, ''),
      case when v_event.include_rsvp_buttons
        then jsonb_build_object('event_id', v_event.id, 'creator_id', v_event.creator_id, 'response_options', jsonb_build_array('GOING','MAYBE','NOT_GOING'), 'image_url', v_event.image_url)
        else jsonb_build_object('event_id', v_event.id, 'creator_id', v_event.creator_id, 'image_url', v_event.image_url)
      end
    from targets t
    returning 1
  ),
  marked as (
    insert into public.event_recommendation_sends(event_id, profile_id, sent_at)
    select v_event.id, t.profile_id, now() from targets t
    on conflict (event_id, profile_id) do nothing
    returning 1
  )
  select count(*) into v_sent from notified;

  return jsonb_build_object('ok', true, 'sent', v_sent);
end;
$$;
revoke all on function public.admin_event_approve(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_event_approve(uuid,uuid) to service_role;

create or replace function public.admin_event_reject(p_event_id uuid, p_admin_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_event record;
begin
  if not exists (select 1 from public.admin_users where id = p_admin_id and is_active = true) then
    raise exception 'admin_required';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'event_not_found'; end if;

  update public.events
  set moderation_status = 'REJECTED', moderated_by = p_admin_id, moderated_at = now(), moderation_note = nullif(btrim(coalesce(p_reason,'')), '')
  where id = p_event_id;

  insert into public.notifications(profile_id, type, title, body, data)
  values (
    v_event.creator_id,
    'EVENT_REJECTED',
    'Événement refusé',
    '« ' || v_event.name || ' » n''a pas été approuvé.' || case when p_reason is not null and btrim(p_reason) <> '' then ' Raison : ' || p_reason else '' end,
    jsonb_build_object('event_id', v_event.id)
  );

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.admin_event_reject(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_event_reject(uuid,uuid,text) to service_role;
