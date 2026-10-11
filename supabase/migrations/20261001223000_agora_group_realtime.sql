-- Scale private Loki chat rooms with Realtime instead of 5-second polling.
-- RLS remains authoritative; publication only streams rows visible to the subscriber.

do $$
begin
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
end
$$;
