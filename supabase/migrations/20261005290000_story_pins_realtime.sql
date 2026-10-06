-- Rafraîchissement en direct de la rangée de stories (Adel 05/10/2026) : une nouvelle story d'un membre apparaît sans recharger l'écran.
-- Additif : ajoute seulement la table à la publication Realtime (les règles RLS de lecture s'appliquent aux événements).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'story_pins') then
    alter publication supabase_realtime add table public.story_pins;
  end if;
end $$;
