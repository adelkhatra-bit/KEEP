-- Cross-story deduplication; exact song names only, no inferred artist link.
-- Existing user music/Stories are untouched; no deletion or FREE charge.
CREATE OR REPLACE FUNCTION public.keep_tracks_same_content(p_left uuid, p_right uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with a as (
    select id, upper(nullif(trim(isrc),'')) isrc, lower(nullif(trim(title),'')) title, lower(nullif(trim(artist),'')) artist, provider_ids, nullif(trim(preview_url),'') preview_url
    from public.tracks where id=p_left
  ), b as (
    select id, upper(nullif(trim(isrc),'')) isrc, lower(nullif(trim(title),'')) title, lower(nullif(trim(artist),'')) artist, provider_ids, nullif(trim(preview_url),'') preview_url
    from public.tracks where id=p_right
  )
  select coalesce((
    select
      a.id=b.id
      or (a.isrc is not null and b.isrc is not null and a.isrc=b.isrc)
      or (nullif(a.provider_ids->>'appleMusic','') is not null and a.provider_ids->>'appleMusic'=b.provider_ids->>'appleMusic')
      or (nullif(a.provider_ids->>'spotify','') is not null and a.provider_ids->>'spotify'=b.provider_ids->>'spotify')
      or (nullif(a.provider_ids->>'deezer','') is not null and a.provider_ids->>'deezer'=b.provider_ids->>'deezer')
      or (nullif(a.provider_ids->>'itunes','') is not null and a.provider_ids->>'itunes'=b.provider_ids->>'itunes')
      or (a.preview_url is not null and b.preview_url is not null and a.preview_url=b.preview_url)
      -- The exact same title + artist may have distinct distributor track IDs,
      -- album covers, genres and expired preview URLs. Those are NOT new keeps.
      or (a.title is not null and a.artist is not null and a.title=b.title and a.artist=b.artist)
    from a cross join b
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.keep_commit_social_free_decision(p_track_id uuid, p_source_profile_id uuid, p_visibility text DEFAULT 'PRIVATE'::text, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  v_visibility text := case when upper(coalesce(p_visibility,'PRIVATE')) = 'PUBLIC' then 'PUBLIC' else 'PRIVATE' end;
  v_existing public.keep_decisions%rowtype;
  v_row public.keep_decisions%rowtype;
  v_origin uuid;
  v_context jsonb;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null or p_source_profile_id is null or p_source_profile_id = uid then raise exception 'SOCIAL_SOURCE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if not (
    exists (select 1 from public.keep_decisions d where d.profile_id = p_source_profile_id and d.track_id = p_track_id and d.decision = 'KEPT' and d.visibility = 'PUBLIC')
    or exists (select 1 from public.story_pins s where s.profile_id = p_source_profile_id and s.track_id = p_track_id and not s.masked and s.pinned_at > now() - interval '24 hours')
  ) then raise exception 'SOCIAL_SOURCE_NOT_PUBLIC'; end if;

  if exists (
    select 1 from public.playlist_sale_offer_tracks pst
    join public.playlist_sale_offers pso on pso.id = pst.offer_id
    where pst.track_id = p_track_id and pso.is_active = true
  ) then raise exception 'SALE_PROTECTED'; end if;

  select * into v_existing from public.keep_decisions
  where profile_id = uid and decision = 'KEPT'
    and public.keep_tracks_same_content(track_id,p_track_id)
  limit 1 for update;
  if found then
    if v_existing.visibility is distinct from v_visibility and v_visibility = 'PUBLIC' then
      update public.keep_decisions set visibility = v_visibility where id = v_existing.id returning * into v_existing;
    end if;
    return jsonb_build_object('ok', true, 'trackId', v_existing.track_id, 'decisionId', v_existing.id, 'createdAt', v_existing.created_at,
      'visibility', v_existing.visibility, 'deduplicated', true, 'charged', 0, 'social', true);
  end if;

  if (select count(*) from public.keep_decisions k
      where k.profile_id = uid and k.context->>'creditPolicy' = 'SOCIAL_ZERO_CREDIT' and k.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'SOCIAL_COPY_DAILY_LIMIT';
  end if;

  v_origin := public.keep_resolve_track_origin(p_track_id, p_source_profile_id, uid);
  v_origin := coalesce(v_origin, p_source_profile_id);
  v_context := coalesce(p_context, '{}'::jsonb) || jsonb_build_object('source', 'social_free', 'sourceProfileId', v_origin, 'creditPolicy', 'SOCIAL_ZERO_CREDIT');

  insert into public.keep_decisions (profile_id, track_id, decision, visibility, recommended_playlist_id, chosen_playlist_id, was_correction, context, source_type, source_user_id)
  values (uid, p_track_id, 'KEPT', v_visibility, null, null, false, v_context, 'profile', v_origin)
  returning * into v_row;

  return jsonb_build_object('ok', true, 'trackId', p_track_id, 'decisionId', v_row.id, 'createdAt', v_row.created_at,
    'visibility', v_row.visibility, 'deduplicated', false, 'charged', 0, 'social', true, 'sourceProfileId', v_origin);
end;
$function$;

create or replace function public.keep_check_own_track(p_track_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $check$
declare
  v_uid uuid := auth.uid();
  v_row public.keep_decisions%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_track_id is null then raise exception 'track_required'; end if;
  select d.* into v_row from public.keep_decisions d
    where d.profile_id=v_uid and d.decision='KEPT'
      and public.keep_tracks_same_content(d.track_id,p_track_id)
    order by d.created_at desc limit 1;
  if found then
    return jsonb_build_object('exists',true,'trackId',v_row.track_id,
      'decisionId',v_row.id,'visibility',v_row.visibility);
  end if;
  return jsonb_build_object('exists',false);
end;
$check$;
revoke all on function public.keep_check_own_track(uuid) from public,anon;
grant execute on function public.keep_check_own_track(uuid) to authenticated;
