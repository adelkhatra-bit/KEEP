-- Adel (02/10/2026) : « un utilisateur peut sortir d'un groupe, le créateur
-- peut supprimer le groupe ; si quelqu'un est retiré ou si le groupe est
-- supprimé, il reçoit une notification -- tout est à base de notification ».
--
-- - Retirer un membre (créateur) : la personne retirée est notifiée.
-- - Sortir du groupe (membre) : le créateur est notifié.
-- - Supprimer le groupe (créateur) : tous les autres membres sont notifiés.
--   Suppression DOUCE : les messages (table protégée) ne sont jamais effacés ;
--   le groupe est marqué deleted_at et les adhésions sont retirées, il
--   disparaît donc pour tout le monde.
-- Additif uniquement : une colonne nullable, deux fonctions. Aucun contenu
-- utilisateur supprimé.

alter table public.music_agora_groups add column if not exists deleted_at timestamptz;

create or replace function public.keep_agora_remove_group_member(p_group_id uuid, p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_actor text;
  v_target text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select owner_id, name into v_owner, v_name from public.music_agora_groups where id=p_group_id and deleted_at is null;
  if v_owner is null then raise exception 'group_not_found' using errcode='P0002'; end if;

  if p_profile_id=v_owner then
    raise exception 'group_owner_cannot_leave' using errcode='22023';
  end if;
  if v_uid<>v_owner and v_uid<>p_profile_id then
    raise exception 'group_owner_required' using errcode='42501';
  end if;

  delete from public.music_agora_group_members
  where group_id=p_group_id and profile_id=p_profile_id;
  if not found then return false; end if;

  select username into v_actor from public.profiles where id=v_uid;
  select username into v_target from public.profiles where id=p_profile_id;

  if v_uid=p_profile_id then
    -- Sortie volontaire : le créateur est prévenu.
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      v_owner,'AGORA_GROUP_MEMBER_LEFT','Un membre a quitté ton groupe',
      '@' || coalesce(v_target,'membre') || ' a quitté « ' || v_name || ' ».',
      jsonb_build_object('event','AGORA_GROUP_MEMBER_LEFT','groupId',p_group_id,'groupName',v_name,'profileId',p_profile_id,'username',v_target),
      'CREATED',0
    );
  else
    -- Retrait par le créateur : la personne retirée est prévenue.
    insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
    values(
      p_profile_id,'AGORA_GROUP_REMOVED','Tu ne fais plus partie d’un groupe',
      '@' || coalesce(v_actor,'le créateur') || ' t’a retiré de « ' || v_name || ' ».',
      jsonb_build_object('event','AGORA_GROUP_REMOVED','groupId',p_group_id,'groupName',v_name,'byUsername',v_actor),
      'CREATED',0
    );
  end if;
  return true;
end;
$function$;

create or replace function public.keep_agora_delete_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
  v_actor text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select owner_id, name into v_owner, v_name from public.music_agora_groups where id=p_group_id and deleted_at is null;
  if v_owner is null then raise exception 'group_not_found' using errcode='P0002'; end if;
  if v_owner<>v_uid then raise exception 'group_owner_required' using errcode='42501'; end if;

  select username into v_actor from public.profiles where id=v_uid;

  insert into public.notifications(profile_id,type,title,body,data,push_delivery_status,push_attempt_count)
  select
    m.profile_id,'AGORA_GROUP_DELETED','Groupe supprimé',
    '@' || coalesce(v_actor,'le créateur') || ' a supprimé « ' || v_name || ' ».',
    jsonb_build_object('event','AGORA_GROUP_DELETED','groupId',p_group_id,'groupName',v_name,'byUsername',v_actor),
    'CREATED',0
  from public.music_agora_group_members m
  where m.group_id=p_group_id and m.profile_id<>v_uid;

  update public.music_agora_groups set deleted_at=now(), updated_at=now() where id=p_group_id;
  -- Les adhésions sont retirées : le groupe disparaît pour tout le monde.
  -- Les messages restent en base (jamais effacés).
  delete from public.music_agora_group_members where group_id=p_group_id;
  return true;
end;
$function$;
revoke all on function public.keep_agora_delete_group(uuid) from public, anon;
grant execute on function public.keep_agora_delete_group(uuid) to authenticated;
