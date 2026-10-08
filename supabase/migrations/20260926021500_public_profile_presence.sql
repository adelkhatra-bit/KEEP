create or replace function public.keep_public_profile_presence(p_profile_id uuid)
returns table(last_seen_at timestamptz, is_online boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sp.last_seen_at,
    (sp.last_seen_at > now() - interval '2 minutes') as is_online
  from public.keep_battle_solo_presence sp
  where sp.profile_id = p_profile_id
  limit 1;
$$;

revoke all on function public.keep_public_profile_presence(uuid) from public;
grant execute on function public.keep_public_profile_presence(uuid) to anon, authenticated;
