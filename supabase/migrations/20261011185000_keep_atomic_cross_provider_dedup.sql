-- Protection atomique et inter-fournisseurs contre le double débit FREE.
-- Aucune table modifiée, aucune décision ni crédit historique supprimé.
-- La décision KEPT existante prime TOUJOURS sur toute facturation.
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

  -- Invariant économique : pour un même contenu identifié chez Apple,
  -- Spotify ou un autre fournisseur, la décision KEPT existante est GRATUITE.
  -- Le verrou transactionnel par utilisateur est acquis AVANT la recherche :
  -- deux clics simultanés ne peuvent donc pas débiter deux fois les FREE.
  select kd.* into v_existing
  from public.keep_decisions kd
  where kd.profile_id=uid
    and kd.decision='KEPT'
    and public.keep_tracks_same_content(kd.track_id,p_track_id)
  order by kd.created_at desc
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
      'trackId',v_existing.track_id,
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

comment on function public.keep_commit_paid_decision(uuid,text,jsonb,uuid,text)
  is 'Déduplication atomique de morceaux équivalents (ISRC, IDs fournisseur, extrait) avant tout débit FREE.';
