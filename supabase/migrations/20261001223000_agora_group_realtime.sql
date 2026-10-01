-- Scale private Loki chat rooms with Realtime instead of polling.
-- The group tables are created by the later private-groups migration.
-- On a fresh database this migration must therefore be safe before those
-- tables exist; the final Realtime setup is reapplied after table creation.

do $$
begin
  if to_regclass('public.music_agora_group_messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='music_agora_group_messages'
     ) then
    alter publication supabase_realtime add table public.music_agora_group_messages;
  end if;

  if to_regclass('public.music_agora_group_members') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='music_agora_group_members'
     ) then
    alter publication supabase_realtime add table public.music_agora_group_members;
  end if;
end
$$;
