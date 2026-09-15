-- Adel (08/09/2026) : billetterie QR individuelle + check-in organisateur +
-- rappel jour-J + export agenda. Au passage, corrige un bug reel trouve en
-- verifiant le schema live avant d'ecrire ce fichier : keep_event_participants
-- (deploye plus tot dans la session) reference deja event_rsvps.updated_at,
-- colonne qui n'a jamais existe -- "Voir les participants" retombait donc
-- silencieusement sur une liste vide a chaque appel (loadEventParticipants
-- avale l'erreur cote client). Corrige ici en ajoutant la colonne manquante.

alter table public.event_rsvps
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists ticket_code text,
  add column if not exists checked_in_at timestamptz;

create unique index if not exists idx_event_rsvps_ticket_code
  on public.event_rsvps(ticket_code) where ticket_code is not null;

drop trigger if exists trg_event_rsvps_updated_at on public.event_rsvps;
create trigger trg_event_rsvps_updated_at before update on public.event_rsvps
  for each row execute function public.set_updated_at();

-- "souhaitez-vous imposer le QR code de l'utilisateur" : coche organisateur.
alter table public.events add column if not exists require_qr_code boolean not null default false;

-- Genere un billet individuel (pseudo + code unique) quand l'evenement
-- l'impose et que le statut passe/reste GOING ; efface le check-in si
-- l'utilisateur change finalement d'avis.
create or replace function public.keep_event_rsvp_assign_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_requires boolean;
  v_code text;
  v_attempt int := 0;
begin
  if new.status = 'GOING' and new.ticket_code is null then
    select require_qr_code into v_requires from public.events where id = new.event_id;
    if coalesce(v_requires, false) then
      loop
        v_attempt := v_attempt + 1;
        v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));
        exit when v_attempt > 5 or not exists (select 1 from public.event_rsvps where ticket_code = v_code);
      end loop;
      new.ticket_code := v_code;
    end if;
  end if;
  if new.status <> 'GOING' then
    new.checked_in_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_event_rsvps_assign_ticket on public.event_rsvps;
create trigger trg_event_rsvps_assign_ticket before insert or update on public.event_rsvps
  for each row execute function public.keep_event_rsvp_assign_ticket();

-- Le billet perso de l'utilisateur (pseudo + QR) pour un evenement ou il
-- participe -- reserve au proprietaire de la ligne (jamais public).
create or replace function public.keep_event_my_ticket(p_event_id uuid)
returns table(
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  username text,
  ticket_code text,
  require_qr_code boolean,
  checked_in_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select e.id, e.name, e.starts_at, e.ends_at, e.venue_name, p.username, r.ticket_code, e.require_qr_code, r.checked_in_at
  from public.event_rsvps r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.profile_id
  where r.event_id = p_event_id and r.profile_id = v_uid and r.status = 'GOING';
end;
$function$;
revoke all on function public.keep_event_my_ticket(uuid) from public;
grant execute on function public.keep_event_my_ticket(uuid) to authenticated;

-- Scan cote organisateur : "il pourra le scanner ... tout ceux qui ont
-- participe et tout ceux qui ne sont pas venus" -- verifie que l'appelant
-- est bien le createur de l'evenement du billet avant de marquer present.
create or replace function public.keep_event_checkin_by_ticket(p_ticket_code text)
returns table(
  profile_id uuid,
  username text,
  event_id uuid,
  event_name text,
  already_checked_in boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select r.profile_id, r.event_id, r.checked_in_at, e.creator_id, e.name as event_name, p.username
  into v_row
  from public.event_rsvps r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.profile_id
  where r.ticket_code = upper(trim(p_ticket_code));

  if v_row is null then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_row.creator_id <> v_uid then raise exception 'FORBIDDEN'; end if;

  return query select v_row.profile_id, v_row.username, v_row.event_id, v_row.event_name, (v_row.checked_in_at is not null);

  update public.event_rsvps set checked_in_at = coalesce(checked_in_at, now())
  where event_id = v_row.event_id and profile_id = v_row.profile_id;
end;
$function$;
revoke all on function public.keep_event_checkin_by_ticket(text) from public;
grant execute on function public.keep_event_checkin_by_ticket(text) to authenticated;

-- Pointage manuel (sans QR) depuis la liste des participants -- bascule
-- present/absent, reserve a l'organisateur.
create or replace function public.keep_event_toggle_checkin(p_event_id uuid, p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_current timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.events where id = p_event_id and creator_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  select checked_in_at into v_current from public.event_rsvps where event_id = p_event_id and profile_id = p_profile_id;
  if v_current is null then
    update public.event_rsvps set checked_in_at = now() where event_id = p_event_id and profile_id = p_profile_id;
    return true;
  else
    update public.event_rsvps set checked_in_at = null where event_id = p_event_id and profile_id = p_profile_id;
    return false;
  end if;
end;
$function$;
revoke all on function public.keep_event_toggle_checkin(uuid,uuid) from public;
grant execute on function public.keep_event_toggle_checkin(uuid,uuid) to authenticated;

-- keep_event_participants gagne ticket_code + checked_in_at (deja reserve a
-- l'organisateur ; DROP necessaire, CREATE OR REPLACE ne permet pas de
-- changer les colonnes de sortie).
drop function if exists public.keep_event_participants(uuid);
create function public.keep_event_participants(p_event_id uuid)
returns table(
  profile_id uuid,
  username text,
  certification_tier text,
  status text,
  responded_at timestamptz,
  ticket_code text,
  checked_in_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.events e where e.id = p_event_id and e.creator_id = v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select
    p.id,
    p.username,
    case
      when coalesce(u.is_anonymous, true) then 'UNVERIFIED'
      when plan.code = 'VENUE_PRO' then 'VENUE_PRO'
      when plan.code = 'CREATOR_PRO' then 'CREATOR_PRO'
      when plan.code = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text,
    r.status::text,
    r.updated_at,
    r.ticket_code,
    r.checked_in_at
  from public.event_rsvps r
  join public.profiles p on p.id = r.profile_id
  join auth.users u on u.id = p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) plan on true
  where r.event_id = p_event_id
  order by case r.status when 'GOING' then 0 when 'MAYBE' then 1 else 2 end, r.updated_at desc
  limit 500;
end;
$function$;
revoke all on function public.keep_event_participants(uuid) from public;
grant execute on function public.keep_event_participants(uuid) to authenticated;

-- Rappel jour-J : "leur rappeler dans la journee" pour qui a repondu
-- participe/plus tard -- fenetre de 14h avant le debut, une seule fois par
-- inscription (reminder_sent_at), s'appuie sur le worker de push existant
-- (toute ligne notifications non poussee est ramassee sous 30s).
create or replace function public.keep_event_send_day_of_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_sent integer := 0;
begin
  with due as (
    select r.event_id, r.profile_id, e.name, e.starts_at, e.venue_name
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
    where r.status in ('GOING','MAYBE')
      and r.reminder_sent_at is null
      and e.is_disabled = false
      and e.starts_at > now()
      and e.starts_at <= now() + interval '14 hours'
    limit 500
  ),
  notified as (
    insert into public.notifications (profile_id, type, title, body, data)
    select
      profile_id,
      'EVENT_REMINDER',
      'Rappel · ' || name,
      'Ce soir a ' || to_char(starts_at at time zone 'UTC', 'HH24:MI') || coalesce(' · ' || venue_name, '') || ' — n''oublie pas !',
      jsonb_build_object('event_id', event_id)
    from due
    returning 1
  ),
  marked as (
    update public.event_rsvps r
    set reminder_sent_at = now()
    from due d
    where r.event_id = d.event_id and r.profile_id = d.profile_id
    returning 1
  )
  select count(*) into v_sent from notified;

  return v_sent;
end;
$function$;
revoke all on function public.keep_event_send_day_of_reminders() from public, anon, authenticated;
grant execute on function public.keep_event_send_day_of_reminders() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'keep-event-day-of-reminders';
select cron.schedule(
  'keep-event-day-of-reminders',
  '*/30 * * * *',
  $cron$ select public.keep_event_send_day_of_reminders(); $cron$
);

-- "une piece jointe comme une photo de l'evenement" -- events.image_url
-- existait deja (0004_events.sql) mais n'etait jamais alimente cote client ;
-- bucket dedie (meme schema de policies que avatars : lecture publique,
-- ecriture/suppression limitee au dossier auth.uid()).
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists event_images_public_read on storage.objects;
create policy event_images_public_read on storage.objects
  for select using (bucket_id = 'event-images');

drop policy if exists event_images_own_insert on storage.objects;
create policy event_images_own_insert on storage.objects
  for insert with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists event_images_own_update on storage.objects;
create policy event_images_own_update on storage.objects
  for update using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists event_images_own_delete on storage.objects;
create policy event_images_own_delete on storage.objects
  for delete using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
