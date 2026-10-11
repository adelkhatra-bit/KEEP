-- Adel (02/10/2026) : « quand il y a du harcèlement, je veux que le Super
-- Admin reçoive la notification pour rappeler à l'ordre / sanctionner en
-- retirant des Free ». Choix validés : alerte Super Admin uniquement ;
-- signalement possible partout (La Place, messages privés, groupes, profils).
--
-- 1. Tout signalement (message ou profil) atterrit dans user_reports (source
--    unique pour le Super Admin).
-- 2. Chaque nouveau signalement crée une notification ADMIN_USER_REPORT pour
--    chaque admin actif (SUPER_ADMIN / ADMIN / MODERATOR). La personne
--    signalée et le signaleur ne sont PAS notifiés (décision Adel).
-- 3. Les messages de groupe ont leur propre table : keep_agora_report_message
--    visait music_agora_messages avec l'id d'un message de groupe (mauvais
--    message). Nouvelle fonction dédiée aux groupes.
-- 4. File Super Admin : admin_user_report_queue + admin_review_user_report.
--    La sanction FREE reste l'outil existant (Utilisateurs > ajuster les Free,
--    montant négatif + raison + notification à l'utilisateur).
-- Aucune donnée existante n'est supprimée ni modifiée.

create index if not exists user_reports_status_created_idx
  on public.user_reports(status, created_at desc);

-- Notification aux admins à chaque nouveau signalement.
create or replace function public.keep_notify_admins_user_report()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_reporter text;
  v_reported text;
  v_reason text;
  v_kind text := upper(coalesce(new.context->>'kind','PROFILE'));
  v_where text;
  v_excerpt text := left(coalesce(new.context->>'excerpt',''),120);
begin
  select username into v_reporter from public.profiles where id=new.reporter_id;
  select username into v_reported from public.profiles where id=new.reported_user_id;
  v_reason := case new.reason
    when 'harassment' then 'harcèlement'
    when 'spam' then 'spam'
    when 'inappropriate_content' then 'contenu inapproprié'
    when 'impersonation' then 'usurpation'
    else 'autre' end;
  v_where := case v_kind
    when 'GROUP' then 'groupe privé'
    when 'DIRECT' then 'message privé'
    when 'PLACE' then 'La Place'
    else 'profil' end;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  select
    a.id,
    'ADMIN_USER_REPORT',
    '🚨 Signalement · ' || v_reason,
    '@' || coalesce(v_reporter,'utilisateur') || ' signale @' || coalesce(v_reported,'utilisateur')
      || ' (' || v_where || ')' || case when v_excerpt<>'' then ' : « ' || v_excerpt || ' »' else '' end,
    jsonb_build_object(
      'event','ADMIN_USER_REPORT',
      'reportId',new.id,
      'reason',new.reason,
      'kind',v_kind,
      'reportedUserId',new.reported_user_id,
      'reportedUsername',v_reported,
      'reporterUsername',v_reporter
    ),
    'CREATED',
    0
  from public.admin_users a
  join public.profiles p on p.id=a.id
  where a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')
    and a.id<>new.reported_user_id;
  return new;
end;
$function$;
revoke all on function public.keep_notify_admins_user_report() from public, anon, authenticated;

drop trigger if exists user_reports_notify_admins on public.user_reports;
create trigger user_reports_notify_admins
  after insert on public.user_reports
  for each row execute function public.keep_notify_admins_user_report();

-- La Place + messages privés (même table) : comportement existant conservé
-- (3 signalements => REVIEW) + copie dans user_reports pour le Super Admin.
create or replace function public.keep_agora_report_message(p_message_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_direct_target uuid;
  v_room text;
  v_body text;
  v_reports integer;
  v_inserted integer;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_reason not in ('spam','harassment','inappropriate_content','other') then
    raise exception 'invalid_reason' using errcode='22023';
  end if;
  select profile_id, target_profile_id, room_slug, body
    into v_target, v_direct_target, v_room, v_body
  from public.music_agora_messages where id=p_message_id;
  if v_target is null then raise exception 'message_not_found' using errcode='P0002'; end if;
  if v_target=v_uid then raise exception 'cannot_report_self' using errcode='22023'; end if;
  -- Un message privé ne peut être signalé que par son destinataire.
  if v_direct_target is not null and v_direct_target<>v_uid then
    raise exception 'message_not_visible' using errcode='42501';
  end if;

  insert into public.music_agora_message_reports(message_id,reporter_id,reason)
  values(p_message_id,v_uid,p_reason)
  on conflict(message_id,reporter_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted>0 then
    insert into public.user_reports(reporter_id,reported_user_id,reason,context)
    values(v_uid,v_target,p_reason,jsonb_build_object(
      'kind', case when v_direct_target is not null then 'DIRECT' else 'PLACE' end,
      'messageId', p_message_id,
      'roomSlug', v_room,
      'excerpt', left(coalesce(v_body,''),200)
    ));
  end if;

  select count(*) into v_reports from public.music_agora_message_reports where message_id=p_message_id;
  if v_reports>=3 then
    update public.music_agora_messages
    set moderation_status='REVIEW'
    where id=p_message_id and moderation_status='VISIBLE';
  end if;
end;
$function$;

-- Groupes privés : seul un membre ACTIF du groupe peut signaler.
create or replace function public.keep_agora_report_group_message(p_message_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_group uuid;
  v_body text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_reason not in ('spam','harassment','inappropriate_content','other') then
    raise exception 'invalid_reason' using errcode='22023';
  end if;
  select profile_id, group_id, body into v_target, v_group, v_body
  from public.music_agora_group_messages where id=p_message_id;
  if v_target is null then raise exception 'message_not_found' using errcode='P0002'; end if;
  if v_target=v_uid then raise exception 'cannot_report_self' using errcode='22023'; end if;
  if not exists(
    select 1 from public.music_agora_group_members
    where group_id=v_group and profile_id=v_uid and status='ACTIVE'
  ) then raise exception 'group_membership_required' using errcode='42501'; end if;

  if exists(
    select 1 from public.user_reports
    where reporter_id=v_uid and context->>'kind'='GROUP' and context->>'messageId'=p_message_id::text
  ) then return; end if;

  insert into public.user_reports(reporter_id,reported_user_id,reason,context)
  values(v_uid,v_target,p_reason,jsonb_build_object(
    'kind','GROUP',
    'messageId',p_message_id,
    'groupId',v_group,
    'excerpt',left(coalesce(v_body,''),200)
  ));
end;
$function$;
revoke all on function public.keep_agora_report_group_message(bigint,text) from public, anon;
grant execute on function public.keep_agora_report_group_message(bigint,text) to authenticated;

-- File Super Admin.
create or replace function public.admin_user_report_queue(p_status text default 'open', p_limit integer default 100)
returns table(
  report_id uuid,
  created_at timestamptz,
  status text,
  reason text,
  kind text,
  excerpt text,
  details text,
  reporter_id uuid,
  reporter_username text,
  reported_user_id uuid,
  reported_username text,
  reported_total_reports bigint
)
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,100),200));
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return query
  select
    r.id, r.created_at, coalesce(r.status,'open'), r.reason,
    upper(coalesce(r.context->>'kind','PROFILE')),
    coalesce(r.context->>'excerpt',''),
    r.details,
    r.reporter_id, rp.username,
    r.reported_user_id, tp.username,
    (select count(*) from public.user_reports x where x.reported_user_id=r.reported_user_id)
  from public.user_reports r
  left join public.profiles rp on rp.id=r.reporter_id
  left join public.profiles tp on tp.id=r.reported_user_id
  where p_status is null or coalesce(r.status,'open')=lower(p_status)
  order by r.created_at desc
  limit v_limit;
end;
$function$;
revoke all on function public.admin_user_report_queue(text,integer) from public, anon;
grant execute on function public.admin_user_report_queue(text,integer) to authenticated;

create or replace function public.admin_review_user_report(p_report_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path=public,auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(p_status,''));
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true and a.role in ('SUPER_ADMIN','ADMIN','MODERATOR')) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  -- Valeurs imposées par user_reports_status_check (existant).
  if v_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'invalid_status' using errcode='22023';
  end if;
  update public.user_reports
  set status=v_status, reviewed_at=now(), reviewed_by=v_uid
  where id=p_report_id;
  if not found then raise exception 'report_not_found' using errcode='P0002'; end if;
end;
$function$;
revoke all on function public.admin_review_user_report(uuid,text) from public, anon;
grant execute on function public.admin_review_user_report(uuid,text) to authenticated;
