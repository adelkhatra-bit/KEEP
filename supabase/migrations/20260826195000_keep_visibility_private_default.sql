-- KEEP — visibilité sûre par défaut.
-- Un morceau gardé n'est publié sur le profil que si l'utilisateur choisit
-- explicitement « Public sur mon profil ». Les anciennes décisions gardent
-- leur valeur existante.
alter table public.keep_decisions
  alter column visibility set default 'PRIVATE';
