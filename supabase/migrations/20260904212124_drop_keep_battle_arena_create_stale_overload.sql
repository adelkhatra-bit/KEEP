-- Piège CREATE OR REPLACE + nouveau paramètre = nouvelle signature :
-- keep_battle_arena_multi_theme_mix a créé un 2e keep_battle_arena_create
-- (3 arguments) SANS remplacer l'ancien (2 arguments) -- PostgREST aurait
-- continué à résoudre les appels existants (2 arguments nommés) vers
-- l'ancienne version, qui ne gère pas theme_codes. Supprime explicitement
-- l'ancienne surcharge.
drop function if exists public.keep_battle_arena_create(text, integer);
