-- Scale private Loki chat rooms with Realtime instead of 5-second polling.
-- Supabase owns the supabase_realtime publication in production. A plain
-- PostgreSQL replay used by CI does not, so publication wiring is conditional.

do $$
begin
  if exists (
    select 1 from pg_publication where pubname='supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='music_agora_group_messages'
    ) then
      alter publication supabase_realtime add table public.music_agora_group_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='music_agora_group_members'
    ) then
      alter publication supabase_realtime add table public.music_agora_group_members;
    end if;
  end if;
end
$$;
