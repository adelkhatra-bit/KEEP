-- Adel (08/09/2026, suite) : "je peux approuver une photo et decliner le
-- texte et mettre un petit message" -- moderation desormais granulaire
-- (photo_status / text_status separes, chacun avec sa propre note),
-- l'evenement au global (moderation_status) ne devient APPROVED que quand
-- LES DEUX sont approuves ; un seul REJECTED suffit a repasser l'ensemble en
-- REJECTED. Egalement : CREATOR_PRO passe de 1 a 2 evenements/mois.

update public.usage_limits ul
set limit_value = 2
from public.plans p
where p.id = ul.plan_id and p.code = 'CREATOR_PRO' and ul.limit_key = 'events_per_month';

alter table public.events
  add column if not exists photo_status public.event_moderation_status not null default 'PENDING',
  add column if not exists photo_note text,
  add column if not exists text_status public.event_moderation_status not null default 'PENDING',
  add column if not exists text_note text,
  -- Adel : "un systeme qui peut detecter quand il y a une suspicion ...
  -- qui s'allume et qu'on la verifie" -- assistant heuristique (mots-cles),
  -- n'a JAMAIS le pouvoir de bloquer ou d'approuver seul : il allume juste
  -- un badge dans la file d'attente du Super Admin, qui reste seul decideur.
  add column if not exists moderation_flag boolean not null default false,
  add column if not exists moderation_flag_reason text;

-- Les evenements deja APPROVED (grandfathering precedent) le restent sur
-- les deux axes ; les rares REJECTED de test restent REJECTED des deux cotes.
update public.events set photo_status = 'APPROVED', text_status = 'APPROVED' where moderation_status = 'APPROVED';
update public.events set photo_status = 'REJECTED', text_status = 'REJECTED' where moderation_status = 'REJECTED';

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
  moderation_status text,
  photo_status text,
  photo_note text,
  text_status text,
  text_note text,
  moderation_flag boolean,
  moderation_flag_reason text,
  require_qr_code boolean,
  include_rsvp_buttons boolean
)
language sql
stable security definer
set search_path = 'public'
as $$
  select e.id, e.name, e.description, e.image_url, e.starts_at, e.venue_name, e.creator_id, p.username, e.created_at,
         e.moderation_status::text, e.photo_status::text, e.photo_note, e.text_status::text, e.text_note,
         e.moderation_flag, e.moderation_flag_reason, e.require_qr_code, e.include_rsvp_buttons
  from public.events e
  join public.profiles p on p.id = e.creator_id
  where e.moderation_status = 'PENDING' and e.is_disabled = false
  order by e.moderation_flag desc, e.created_at asc
  limit 200;
$$;
revoke all on function public.admin_event_moderation_queue() from public, anon, authenticated;
grant execute on function public.admin_event_moderation_queue() to service_role;

-- Coeur du systeme : decide UN SEUL champ (photo ou texte). Notifie
-- l'organisateur immediatement si c'est un refus (avec la note), et
-- seulement quand LA TRANSITION fait passer l'evenement complet en APPROVED
-- pour la premiere fois (photo ET texte approuves) : notification + diffusion
-- a l'audience (abonnes + personnes ayant deja garde un morceau du createur),
-- avec le pseudo du createur et un rappel QR code si l'evenement l'exige.
-- Idempotent par construction via event_recommendation_sends.
create or replace function public.admin_event_decide_field(
  p_event_id uuid,
  p_admin_id uuid,
  p_field text,
  p_decision text,
  p_note text default null,
  p_notify_field boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_event record;
  v_creator_username text;
  v_new_photo public.event_moderation_status;
  v_new_text public.event_moderation_status;
  v_overall public.event_moderation_status;
  v_was_approved boolean;
  v_sent integer := 0;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_field_label text;
begin
  if not exists (select 1 from public.admin_users where id = p_admin_id and is_active = true) then
    raise exception 'admin_required';
  end if;
  if p_field not in ('photo', 'text') then raise exception 'invalid_field'; end if;
  if p_decision not in ('APPROVE', 'REJECT') then raise exception 'invalid_decision'; end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'event_not_found'; end if;
  select username into v_creator_username from public.profiles where id = v_event.creator_id;

  v_was_approved := v_event.moderation_status = 'APPROVED';
  v_new_photo := v_event.photo_status;
  v_new_text := v_event.text_status;
  if p_field = 'photo' then
    v_new_photo := case when p_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end;
  else
    v_new_text := case when p_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end;
  end if;

  v_overall := case
    when v_new_photo = 'REJECTED' or v_new_text = 'REJECTED' then 'REJECTED'
    when v_new_photo = 'APPROVED' and v_new_text = 'APPROVED' then 'APPROVED'
    else 'PENDING'
  end;

  update public.events set
    photo_status = v_new_photo,
    photo_note = case when p_field = 'photo' then v_note else photo_note end,
    text_status = v_new_text,
    text_note = case when p_field = 'text' then v_note else text_note end,
    moderation_status = v_overall,
    moderated_by = p_admin_id,
    moderated_at = now()
  where id = p_event_id;

  v_field_label := case when p_field = 'photo' then 'la photo' else 'le texte' end;

  if p_decision = 'REJECT' and p_notify_field then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      v_event.creator_id,
      'EVENT_FIELD_REJECTED',
      case when p_field = 'photo' then 'Photo refusée' else 'Texte refusé' end || ' · ' || v_event.name,
      coalesce(v_note, 'Le Super Admin a refusé ' || v_field_label || ' de ton événement. Modifie-le et il repartira en validation.'),
      jsonb_build_object('event_id', v_event.id, 'field', p_field)
    );
  end if;

  if v_overall = 'APPROVED' and not v_was_approved then
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
        '@' || coalesce(v_creator_username, 'keep-user') || ' t''invite à un événement',
        v_event.name || ' · ' || to_char(v_event.starts_at at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || coalesce(' · ' || v_event.venue_name, '')
          || case when v_event.require_qr_code then ' · Présente le QR code à l''arrivée' else '' end,
        case when v_event.include_rsvp_buttons
          then jsonb_build_object('event_id', v_event.id, 'creator_id', v_event.creator_id, 'creator_username', v_creator_username, 'response_options', jsonb_build_array('GOING','MAYBE','NOT_GOING'), 'image_url', v_event.image_url, 'require_qr_code', v_event.require_qr_code)
          else jsonb_build_object('event_id', v_event.id, 'creator_id', v_event.creator_id, 'creator_username', v_creator_username, 'image_url', v_event.image_url, 'require_qr_code', v_event.require_qr_code)
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
  end if;

  return jsonb_build_object('ok', true, 'sent', v_sent, 'overall', v_overall::text);
end;
$$;
revoke all on function public.admin_event_decide_field(uuid,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_event_decide_field(uuid,uuid,text,text,text,boolean) to service_role;

-- Raccourcis "tout approuver" / "tout refuser" -- reutilises par
-- keep-admin-control (moderation.events_approve / moderation.events_reject),
-- deja deployes, aucun changement d'API cote edge function necessaire.
create or replace function public.admin_event_approve(p_event_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare r1 jsonb; r2 jsonb;
begin
  r1 := public.admin_event_decide_field(p_event_id, p_admin_id, 'photo', 'APPROVE', null);
  r2 := public.admin_event_decide_field(p_event_id, p_admin_id, 'text', 'APPROVE', null);
  return jsonb_build_object('ok', true, 'sent', coalesce((r1->>'sent')::int,0) + coalesce((r2->>'sent')::int,0));
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
  select * into v_event from public.events where id = p_event_id;
  if v_event.id is null then raise exception 'event_not_found'; end if;

  perform public.admin_event_decide_field(p_event_id, p_admin_id, 'photo', 'REJECT', p_reason, false);
  perform public.admin_event_decide_field(p_event_id, p_admin_id, 'text', 'REJECT', p_reason, false);

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
