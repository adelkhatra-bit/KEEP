-- Private-group Realtime RLS is intentionally finalized only after the
-- private-group tables exist. This early compatibility migration stays safe
-- on a fresh PostgreSQL database and avoids referencing relations that are
-- created later in the historical migration chain.
do $$
begin
  if to_regclass('public.music_agora_group_members') is null
     or to_regclass('public.music_agora_group_messages') is null then
    raise notice 'Agora group Realtime RLS deferred until private-group tables exist';
  end if;
end
$$;
