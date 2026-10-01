-- Realtime transport for Loki chat.
-- Client still keeps a short polling fallback, but INSERT events should arrive immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='music_agora_messages'
     ) then
    alter publication supabase_realtime add table public.music_agora_messages;
  end if;
end $$;
