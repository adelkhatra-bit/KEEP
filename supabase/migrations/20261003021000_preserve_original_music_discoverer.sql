-- Loki Music : conserve l'empreinte du tout premier découvreur à travers
-- tous les repartages, au lieu d'écraser l'origine par le dernier relais.

create or replace function public.keep_resolve_track_origin(
  p_track_id uuid,
  p_source_profile_id uuid,
  p_exclude_profile_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_cursor uuid := p_source_profile_id;
  v_origin uuid := p_source_profile_id;
  v_parent uuid;
  v_seen uuid[] := array[]::uuid[];
  v_depth integer := 0;
begin
  if p_track_id is null or p_source_profile_id is null then return null; end if;
  if p_exclude_profile_id is not null and p_source_profile_id = p_exclude_profile_id then return null; end if;

  while v_cursor is not null and v_depth < 32 loop
    if v_cursor = any(v_seen) then exit; end if;
    v_seen := array_append(v_seen, v_cursor);
    v_origin := v_cursor;

    select kd.source_user_id
      into v_parent
    from public.keep_decisions kd
    where kd.profile_id = v_cursor
      and kd.track_id = p_track_id
      and kd.decision = 'KEPT'
    order by kd.created_at asc
    limit 1;

    if v_parent is null then exit; end if;
    if p_exclude_profile_id is not null and v_parent = p_exclude_profile_id then exit; end if;
    if v_parent = any(v_seen) then exit; end if;

    v_cursor := v_parent;
    v_depth := v_depth + 1;
  end loop;

  return v_origin;
end;
$function$;

revoke all on function public.keep_resolve_track_origin(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.keep_resolve_track_origin(uuid,uuid,uuid) to service_role;

create or replace function public.keep_commit_paid_decision(
  p_track_id uuid,
  p_visibility text default 'PRIVATE',
  p_context jsonb default '{}'::jsonb,
  p_source_profile_id uuid default null,
  p_source_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE'))='PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_existing public.keep_decisions%rowtype;
  v_origin uuid := null;
  v_credit record;
  v_row public.keep_decisions%rowtype;
  v_source_profile uuid := case when p_source_profile_id is distinct from uid then p_source_profile_id else null end;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null then raise exception 'track_required'; end if;
  if not exists(select 1 from public.tracks where id=p_track_id) then raise exception 'track_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select * into v_existing
  from public.keep_decisions
  where profile_id=uid and track_id=p_track_id and decision='KEPT'
  limit 1
  for update;

  if found then
    if v_existing.visibility is distinct from v_visibility then
      update public.keep_decisions
      set visibility=v_visibility
      where id=v_existing.id
      returning * into v_existing;
    end if;

    return jsonb_build_object(
      'ok',true,
      'trackId',p_track_id,
      'decisionId',v_existing.id,
      'createdAt',v_existing.created_at,
      'visibility',v_existing.visibility,
      'deduplicated',true,
      'charged',0
    );
  end if;

  if v_source_profile is not null then
    v_origin := public.keep_resolve_track_origin(p_track_id, v_source_profile, uid);
    v_origin := coalesce(v_origin, v_source_profile);
  end if;

  select * into v_credit
  from public.keep_consume_download_credit_for_source(coalesce(nullif(trim(p_source_key),''),'unknown'));

  if not coalesce(v_credit.allowed,false) then
    raise exception 'CREDITS_EXHAUSTED';
  end if;

  insert into public.keep_decisions(
    profile_id,track_id,decision,visibility,
    recommended_playlist_id,chosen_playlist_id,was_correction,
    context,source_type,source_user_id
  )
  values(
    uid,p_track_id,'KEPT',v_visibility,
    null,null,false,
    coalesce(p_context,'{}'::jsonb),
    case when v_source_profile is not null then 'profile' else null end,
    v_origin
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'trackId',p_track_id,
    'decisionId',v_row.id,
    'createdAt',v_row.created_at,
    'visibility',v_row.visibility,
    'deduplicated',false,
    'charged',coalesce((select (value #>> '{}')::integer from public.remote_config where key='free_cost_per_keep' limit 1),1),
    'sourceKey',coalesce(nullif(trim(p_source_key),''),'unknown')
  );
end;
$function$;

-- Aplatissement unique des chaînes déjà existantes. Aucun morceau ni décision
-- n'est supprimé : seule la référence d'origine est corrigée.
update public.keep_decisions kd
set source_user_id = public.keep_resolve_track_origin(kd.track_id, kd.source_user_id, kd.profile_id)
where kd.decision='KEPT'
  and kd.source_user_id is not null
  and public.keep_resolve_track_origin(kd.track_id, kd.source_user_id, kd.profile_id) is distinct from kd.source_user_id;
