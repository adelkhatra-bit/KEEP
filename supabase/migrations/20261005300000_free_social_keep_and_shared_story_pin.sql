-- Décision d'Adel (05/10/2026), additive :
--  (1) partager dans MA story une musique PUBLIQUE d'un autre membre est GRATUIT et ne demande pas de la garder (pub pour le premier découvreur) ;
--  (2) garder une musique rendue PUBLIQUE par un autre membre est GRATUIT, marquée du nom du PREMIER découvreur ;
--  les musiques en vente restent payantes (SALE_PROTECTED). Aucune donnée existante n'est modifiée.
alter table public.story_pins add column if not exists shared_from uuid references public.profiles(id) on delete set null;

create or replace function public.keep_pin_shared_story_track(p_track_id uuid, p_from_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_track_id is null or p_from_profile_id is null or p_from_profile_id = uid then raise exception 'INVALID_SHARE_SOURCE'; end if;
  if not (
    exists (select 1 from public.keep_decisions d where d.profile_id = p_from_profile_id and d.track_id = p_track_id and d.decision = 'KEPT' and d.visibility = 'PUBLIC')
    or exists (select 1 from public.story_pins s where s.profile_id = p_from_profile_id and s.track_id = p_track_id and not s.masked and s.pinned_at > now() - interval '24 hours')
  ) then raise exception 'SHARE_SOURCE_NOT_PUBLIC'; end if;
  if exists (
    select 1 from public.playlist_sale_offer_tracks pst
    join public.playlist_sale_offers pso on pso.id = pst.offer_id
    where pst.track_id = p_track_id and pso.is_active = true
  ) then raise exception 'SALE_PROTECTED'; end if;
  insert into public.story_pins (profile_id, track_id, masked, shared_from)
  values (uid, p_track_id, false, p_from_profile_id)
  on conflict (profile_id, track_id) do update set pinned_at = now();
  return true;
end;
$function$;
revoke all on function public.keep_pin_shared_story_track(uuid, uuid) from public, anon;
grant execute on function public.keep_pin_shared_story_track(uuid, uuid) to authenticated;

create or replace function public.keep_commit_social_free_decision(
  p_track_id uuid, p_source_profile_id uuid, p_visibility text default 'PRIVATE', p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
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
  where profile_id = uid and track_id = p_track_id and decision = 'KEPT'
  limit 1 for update;
  if found then
    if v_existing.visibility is distinct from v_visibility and v_visibility = 'PUBLIC' then
      update public.keep_decisions set visibility = v_visibility where id = v_existing.id returning * into v_existing;
    end if;
    return jsonb_build_object('ok', true, 'trackId', p_track_id, 'decisionId', v_existing.id, 'createdAt', v_existing.created_at,
      'visibility', v_existing.visibility, 'deduplicated', true, 'charged', 0, 'social', true);
  end if;

  -- Garde-fou anti-abus : au plus 200 reprises gratuites par 24 h et par membre.
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
revoke all on function public.keep_commit_social_free_decision(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.keep_commit_social_free_decision(uuid, uuid, text, jsonb) to authenticated;

-- Petite alerte « nouveau visiteur » (Adel 05/10/2026) : le propriétaire d'une story reçoit en direct (Realtime) les vues de SA story.
-- Lecture réservée au propriétaire ; les autres RPC (liste des vues) restent inchangées.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'story_views' and policyname = 'story_views_owner_select') then
    create policy story_views_owner_select on public.story_views for select to authenticated using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'story_views') then
    alter publication supabase_realtime add table public.story_views;
  end if;
end $$;
