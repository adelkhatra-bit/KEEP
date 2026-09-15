-- Adel (03/09/2026) : "Impossible de traiter cette invitation" à
-- l'acceptation d'un défi -- root-causé via les logs (error=23514, check
-- constraint violation) : keep_battle_arenas_round_count_check plafonnait
-- encore round_count à 12 au niveau de la TABLE, alors que la migration
-- précédente (20260903050000) n'avait relevé le plafond que dans la
-- logique PL/pgSQL (keep_battle_arena_create/keep_battle_challenge_send).
-- Tout choix de 15/20/30 morceaux échouait donc systématiquement à la
-- création de l'arène, avec un message générique côté client qui masquait
-- la vraie cause.
alter table public.keep_battle_arenas drop constraint if exists keep_battle_arenas_round_count_check;
alter table public.keep_battle_arenas add constraint keep_battle_arenas_round_count_check check (round_count >= 5 and round_count <= 30);
