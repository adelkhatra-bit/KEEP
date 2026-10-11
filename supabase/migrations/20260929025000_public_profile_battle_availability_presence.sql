-- Public profile Battle availability should match the explicit Battle ON/OFF state.
-- New and existing profiles default to manual_available=true; users can turn it off.
-- last_seen_at remains available for "last active" copy, but the public Battle glow
-- follows the user's Battle availability rather than a short heartbeat window.
create or replace function public.keep_public_profile_presence(p_profile_id uuid)
returns table(last_seen_at timestamptz, is_online boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sp.last_seen_at,
    coalesce(sp.manual_available, false) as is_online
  from public.keep_battle_solo_presence sp
  where sp.profile_id = p_profile_id
  limit 1;
$$;

revoke all on function public.keep_public_profile_presence(uuid) from public;
grant execute on function public.keep_public_profile_presence(uuid) to anon, authenticated;
