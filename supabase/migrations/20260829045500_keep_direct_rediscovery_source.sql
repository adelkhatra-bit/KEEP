-- KEEP — une redécouverte réelle via Écouter devient la nouvelle source de
-- découverte pour les partages futurs, sans effacer l'historique social.
--
-- Cas visé : B récupère gratuitement un morceau depuis le profil de A, puis B
-- retrouve ensuite lui-même ce morceau avec Écouter. Le KEEP de B reste unique,
-- mais il devient désormais une découverte directe pour les futures reprises
-- depuis le profil de B. L'ancienne provenance A reste conservée dans context.

create or replace function public.keep_mark_direct_rediscovery(
  p_track_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_row public.keep_decisions%rowtype;
  v_previous_source_profile_id text;
begin
  if v_profile_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
    into v_row
  from public.keep_decisions
  where profile_id = v_profile_id
    and track_id = p_track_id
    and decision = 'KEPT'
  order by created_at desc, id desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  -- Déjà une découverte directe : aucun changement nécessaire.
  if coalesce(v_row.source_type, '') <> 'profile'
     and v_row.source_user_id is null
     and coalesce(v_row.context ->> 'creditPolicy', '') <> 'SOCIAL_ZERO_CREDIT' then
    return false;
  end if;

  v_previous_source_profile_id := nullif(v_row.context ->> 'sourceProfileId', '');

  update public.keep_decisions
  set
    source_type = null,
    source_user_id = null,
    context =
      (
        coalesce(v_row.context, '{}'::jsonb)
        - 'sourceProfileId'
        - 'sourceUsername'
        - 'creditPolicy'
      )
      || (
        coalesce(p_context, '{}'::jsonb)
        - 'sourceProfileId'
        - 'sourceUsername'
        - 'creditPolicy'
      )
      || jsonb_strip_nulls(jsonb_build_object(
        'creditPolicy', 'LISTEN_KEEP',
        'rediscoveredViaListenAt', clock_timestamp(),
        'previousSocialOriginUserId', v_row.source_user_id,
        'previousSocialSourceProfileId', v_previous_source_profile_id,
        'previousSourceType', v_row.source_type
      ))
  where id = v_row.id;

  return true;
end;
$$;

revoke all on function public.keep_mark_direct_rediscovery(uuid, jsonb) from public;
grant execute on function public.keep_mark_direct_rediscovery(uuid, jsonb) to authenticated;
