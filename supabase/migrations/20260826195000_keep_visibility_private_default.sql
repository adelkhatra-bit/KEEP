-- KEEP — visibilité sûre par défaut.
-- Un morceau gardé n'est publié sur le profil que si l'utilisateur choisit
-- explicitement « Public sur mon profil ». Les anciennes décisions gardent
-- leur valeur existante.
--
-- Certains environnements historiques avaient reçu la colonne via un correctif
-- runtime avant que ce fichier soit versionné. Une base neuve doit néanmoins
-- pouvoir rejouer TOUTES les migrations sans dépendre de ce correctif externe.
alter table public.keep_decisions
  add column if not exists visibility text not null default 'PRIVATE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.keep_decisions'::regclass
      and conname = 'keep_decisions_visibility_check'
  ) then
    alter table public.keep_decisions
      add constraint keep_decisions_visibility_check
      check (visibility in ('PUBLIC', 'FOLLOWERS', 'PRIVATE'));
  end if;
end $$;

alter table public.keep_decisions
  alter column visibility set default 'PRIVATE';
