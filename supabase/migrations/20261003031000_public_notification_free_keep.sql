-- Loki Music — ajout gratuit depuis une vraie notification de morceau public.
-- Le serveur vérifie l'appartenance de la notification, le morceau et l'absence
-- de protection par une offre active. Aucune consommation de FREE.

create or replace function public.keep_commit_public_notification_keep(
  p_notification_id uuid,
  p_visibility text default 'PRIVATE'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_notification public.notifications%rowtype;
  v_track_id uuid;
  v_owner_id uuid;
  v_source_id uuid;
  v_origin_id uuid;
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE'))='PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_existing public.keep_decisions%rowtype;
  v_row public.keep_decisions%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_notification_id is null then raise exception 'notification_required'; end if;

  select *
  into v_notification
  from public.notifications n
  where n.id = p_notification_id
    and n.profile_id = v_uid
    and upper(n.type) = 'NEW_PUBLIC_KEEP'
  for update;

  if v_notification.id is null then
    raise exception 'notification_not_found';
  end if;

  begin
    v_track_id := nullif(v_notification.data->>'trackId','')::uuid;
    v_owner_id := nullif(v_notification.data->>'ownerProfileId','')::uuid;
    v_source_id := coalesce(
      nullif(v_notification.data->>'sourceProfileId','')::uuid,
      v_owner_id
    );
  exception when invalid_text_representation then
    raise exception 'notification_invalid_track';
  end;

  if v_track_id is null or not exists(select 1 from public.tracks t where t.id=v_track_id) then
    raise exception 'track_not_found';
  end if;

  -- Une collection en vente garde toujours son parcours protégé/payant.
  if v_owner_id is not null
     and v_track_id = any(public.keep_playlist_sale_masked_track_ids(v_owner_id)) then
    raise exception 'TRACK_SALE_PROTECTED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_track_id::text, 0));

  select *
  into v_existing
  from public.keep_decisions kd
  where kd.profile_id=v_uid
    and kd.track_id=v_track_id
    and kd.decision='KEPT'
  order by kd.created_at asc
  limit 1
  for update;

  if v_existing.id is not null then
    if v_existing.visibility is distinct from v_visibility then
      update public.keep_decisions
      set visibility=v_visibility
      where id=v_existing.id
      returning * into v_existing;
    end if;

    return jsonb_build_object(
      'ok',true,
      'trackId',v_track_id,
      'decisionId',v_existing.id,
      'visibility',v_existing.visibility,
      'deduplicated',true,
      'charged',0
    );
  end if;

  if v_source_id = v_uid then v_source_id := null; end if;
  if v_source_id is not null then
    v_origin_id := public.keep_resolve_track_origin(v_track_id, v_source_id, v_uid);
    v_origin_id := coalesce(v_origin_id, v_source_id);
  end if;

  insert into public.keep_decisions(
    profile_id,track_id,decision,visibility,
    recommended_playlist_id,chosen_playlist_id,was_correction,
    context,source_type,source_user_id
  )
  values(
    v_uid,v_track_id,'KEPT',v_visibility,
    null,null,false,
    jsonb_build_object(
      'source','follow_notification',
      'notificationId',p_notification_id,
      'creditPolicy','PUBLIC_NOTIFICATION_FREE',
      'ownerProfileId',v_owner_id
    ),
    case when v_origin_id is not null then 'profile' else null end,
    v_origin_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'trackId',v_track_id,
    'decisionId',v_row.id,
    'visibility',v_row.visibility,
    'deduplicated',false,
    'charged',0,
    'sourceProfileId',v_origin_id
  );
end;
$function$;

revoke all on function public.keep_commit_public_notification_keep(uuid,text) from public, anon;
grant execute on function public.keep_commit_public_notification_keep(uuid,text) to authenticated;

-- Le texte visible ne révèle ni titre ni artiste.
update public.notifications
set body = 'Titre et artiste masqués · écoute le morceau puis ajoute-le gratuitement pour les découvrir.'
where type='NEW_PUBLIC_KEEP';

create or replace function public.keep_process_public_track_notification_fanout(
  p_jobs integer default 40,
  p_batch integer default 2000
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
  p_jobs := greatest(1, least(coalesce(p_jobs, 40), 100));
  p_batch := greatest(100, least(coalesce(p_batch, 2000), 5000));

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
        'Nouveau morceau chez ' || coalesce(nullif(v_job.owner_username, ''), 'Loki'),
        'Titre et artiste masqués · écoute le morceau puis ajoute-le gratuitement pour les découvrir.',
        jsonb_build_object(
          'ownerProfileId', v_job.owner_profile_id,
          'username', v_job.owner_username,
          'sourceProfileId', coalesce(v_job.source_profile_id, v_job.owner_profile_id),
          'sourceUsername', coalesce(v_job.source_username, v_job.owner_username),
          'trackId', v_job.track_id,
          'decisionId', v_job.decision_id,
          'masked', true,
          'freeKeep', true,
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

revoke all on function public.keep_process_public_track_notification_fanout(integer,integer) from public, anon, authenticated;
grant execute on function public.keep_process_public_track_notification_fanout(integer,integer) to service_role;
