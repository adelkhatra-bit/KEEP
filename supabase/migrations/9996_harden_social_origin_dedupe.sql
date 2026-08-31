create or replace function public.keep_mark_social_origin(p_decision_id uuid, p_source_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  target_track uuid;
  existing_source uuid;
  existing_type text;
  next_count integer := 0;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if p_source_profile_id is null or p_source_profile_id = uid then raise exception 'invalid_social_origin'; end if;

  select kd.track_id, kd.source_user_id, kd.source_type
    into target_track, existing_source, existing_type
  from public.keep_decisions kd
  where kd.id = p_decision_id
    and kd.profile_id = uid
    and kd.decision = 'KEPT';

  if target_track is null then raise exception 'decision_not_found'; end if;

  -- L'origine sociale est désormais définie atomiquement lors de la création
  -- de la décision par keep-music-core. Cet ancien RPC reste compatible avec
  -- les vieux clients mais n'a plus le droit de transformer un KEEP existant.
  next_count := public.keep_chargeable_keep_count(uid);
  insert into public.download_credit_usage(profile_id, consumed_count, updated_at)
  values(uid, next_count, now())
  on conflict(profile_id) do update
  set consumed_count = excluded.consumed_count,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'decisionId', p_decision_id,
    'sourceProfileId', existing_source,
    'sourceType', existing_type,
    'preserved', true,
    'chargeableKeeps', next_count
  );
end;
$$;
