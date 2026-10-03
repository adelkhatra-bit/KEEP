-- Loki Music : une notification NEW_PUBLIC_KEEP peut être reprise gratuitement
-- uniquement par son destinataire, uniquement pour le morceau exact encore public.
-- Les collections actives en vente restent exclues de ce chemin.

create or replace function public.keep_commit_follow_notification_decision(
  p_notification_id uuid,
  p_track_id uuid,
  p_visibility text default 'PRIVATE',
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE'))='PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_notification public.notifications%rowtype;
  v_existing public.keep_decisions%rowtype;
  v_row public.keep_decisions%rowtype;
  v_owner_profile_id uuid;
  v_source_profile_id uuid;
  v_origin uuid;
  v_decision_id uuid;
  v_context jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_notification_id is null then raise exception 'FOLLOW_NOTIFICATION_REQUIRED'; end if;
  if p_track_id is null then raise exception 'track_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));

  select * into v_notification
  from public.notifications n
  where n.id = p_notification_id
    and n.profile_id = uid
    and upper(n.type) = 'NEW_PUBLIC_KEEP'
  for update;

  if not found then raise exception 'FOLLOW_NOTIFICATION_REQUIRED'; end if;
  if coalesce(v_notification.data->>'trackId', v_notification.data->>'track_id', '') <> p_track_id::text then
    raise exception 'NOTIFICATION_TRACK_MISMATCH';
  end if;

  if coalesce(v_notification.data->>'ownerProfileId', v_notification.data->>'owner_profile_id', '') ~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    v_owner_profile_id := coalesce(v_notification.data->>'ownerProfileId', v_notification.data->>'owner_profile_id')::uuid;
  end if;
  if coalesce(v_notification.data->>'sourceProfileId', v_notification.data->>'source_profile_id', '') ~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    v_source_profile_id := coalesce(v_notification.data->>'sourceProfileId', v_notification.data->>'source_profile_id')::uuid;
  end if;
  v_source_profile_id := coalesce(v_source_profile_id, v_owner_profile_id);

  if coalesce(v_notification.data->>'decisionId', v_notification.data->>'decision_id', '') ~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    v_decision_id := coalesce(v_notification.data->>'decisionId', v_notification.data->>'decision_id')::uuid;
  end if;

  if v_owner_profile_id is null or v_owner_profile_id = uid or v_source_profile_id is null or v_source_profile_id = uid then
    raise exception 'FOLLOW_NOTIFICATION_REQUIRED';
  end if;

  if v_decision_id is not null then
    if not exists (
      select 1 from public.keep_decisions kd
      where kd.id = v_decision_id
        and kd.profile_id = v_owner_profile_id
        and kd.track_id = p_track_id
        and kd.decision = 'KEPT'
        and kd.visibility = 'PUBLIC'
    ) then
      raise exception 'NOTIFICATION_TRACK_NOT_PUBLIC';
    end if;
  elsif not exists (
    select 1 from public.keep_decisions kd
    where kd.profile_id = v_owner_profile_id
      and kd.track_id = p_track_id
      and kd.decision = 'KEPT'
      and kd.visibility = 'PUBLIC'
  ) then
    raise exception 'NOTIFICATION_TRACK_NOT_PUBLIC';
  end if;

  if exists (
    select 1
    from public.playlist_sale_offer_tracks pot
    join public.playlist_sale_offers po on po.id = pot.offer_id
    where pot.track_id = p_track_id
      and po.seller_id = v_owner_profile_id
      and po.is_active = true
  ) then
    raise exception 'SALE_PROTECTED';
  end if;

  select * into v_existing
  from public.keep_decisions
  where profile_id = uid and track_id = p_track_id and decision = 'KEPT'
  limit 1
  for update;

  if found then
    if v_existing.visibility is distinct from v_visibility then
      update public.keep_decisions
      set visibility = v_visibility
      where id = v_existing.id
      returning * into v_existing;
    end if;
    return jsonb_build_object(
      'ok',true,'trackId',p_track_id,'decisionId',v_existing.id,
      'createdAt',v_existing.created_at,'visibility',v_existing.visibility,
      'deduplicated',true,'charged',0,'social',true
    );
  end if;

  v_origin := public.keep_resolve_track_origin(p_track_id, v_source_profile_id, uid);
  v_origin := coalesce(v_origin, v_source_profile_id);

  v_context := coalesce(p_context,'{}'::jsonb) || jsonb_build_object(
    'source','follow_notification',
    'notificationId',p_notification_id,
    'sourceProfileId',v_origin,
    'creditPolicy','SOCIAL_ZERO_CREDIT'
  );

  insert into public.keep_decisions(
    profile_id,track_id,decision,visibility,
    recommended_playlist_id,chosen_playlist_id,was_correction,
    context,source_type,source_user_id
  )
  values(
    uid,p_track_id,'KEPT',v_visibility,
    null,null,false,
    v_context,'profile',v_origin
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'trackId',p_track_id,'decisionId',v_row.id,
    'createdAt',v_row.created_at,'visibility',v_row.visibility,
    'deduplicated',false,'charged',0,'social',true,
    'sourceProfileId',v_origin
  );
end;
$function$;

revoke all on function public.keep_commit_follow_notification_decision(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.keep_commit_follow_notification_decision(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.loki_normalize_new_public_keep_notification()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if upper(coalesce(new.type,'')) = 'NEW_PUBLIC_KEEP' then
    new.body := 'Titre et artiste masqués · écoute puis garde gratuitement pour les révéler.';
    new.data := (coalesce(new.data,'{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl')
      || '{"masked":true,"freeSocialKeep":true}'::jsonb;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_loki_normalize_new_public_keep_notification on public.notifications;
create trigger trg_loki_normalize_new_public_keep_notification
before insert or update on public.notifications
for each row execute function public.loki_normalize_new_public_keep_notification();

update public.notifications
set body = 'Titre et artiste masqués · écoute puis garde gratuitement pour les révéler.',
    data = (coalesce(data,'{}'::jsonb) - 'trackTitle' - 'trackArtist' - 'artworkUrl')
      || '{"masked":true,"freeSocialKeep":true}'::jsonb
where upper(type) = 'NEW_PUBLIC_KEEP';
