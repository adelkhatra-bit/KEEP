-- Activer les évènements Realtime des sessions musicales synchronisées PC ↔ iPhone.
-- RLS utilisateur déjà actif sur keep_device_sessions ; aucune donnée inter-comptes.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'keep_device_sessions'
  ) then
    alter publication supabase_realtime add table public.keep_device_sessions;
  end if;
end $$;
