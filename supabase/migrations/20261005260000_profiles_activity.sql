-- Activité réelle d'un lot de profils (Adel 05/10/2026) : dernière connexion, dernier GARDER, dernière épingle de story -> tri intelligent de la rangée de stories. Lecture seule, additif.
create or replace function public.keep_profiles_activity(p_profile_ids uuid[])
returns table(profile_id uuid, last_active_at timestamptz, is_online boolean)
language sql stable security definer set search_path to 'public' as $$
  select ids.id,
    greatest(
      sp.app_last_seen_at, sp.last_seen_at,
      (select max(kd.created_at) from public.keep_decisions kd where kd.profile_id = ids.id),
      (select max(pin.pinned_at) from public.story_pins pin where pin.profile_id = ids.id)
    ) as last_active_at,
    coalesce(greatest(sp.app_last_seen_at, sp.last_seen_at) > now() - interval '5 minutes', false) as is_online
  from unnest(p_profile_ids) as ids(id)
  join public.profiles p on p.id = ids.id
  left join public.keep_battle_solo_presence sp on sp.profile_id = ids.id;
$$;
revoke all on function public.keep_profiles_activity(uuid[]) from public, anon;
grant execute on function public.keep_profiles_activity(uuid[]) to authenticated;
