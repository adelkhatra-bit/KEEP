-- Adel (03/09/2026) : deuxième occurrence du même trou -- root-causé via les
-- logs postgres ("new row for relation keep_battle_arena_rounds violates
-- check constraint keep_battle_arena_rounds_position_check") : cette
-- contrainte plafonnait position à 12, alors que keep_battle_arena_rounds
-- reçoit désormais jusqu'à 30 lignes par match (une par manche, voir
-- keep_battle_arena_seed_rounds qui boucle sur a.round_count). Toute
-- acceptation d'un défi proposé avec plus de 12 morceaux échouait donc à la
-- création des manches elles-mêmes, après que le plafond de round_count ait
-- déjà été corrigé sur la table des arènes (migration précédente).
alter table public.keep_battle_arena_rounds drop constraint if exists keep_battle_arena_rounds_position_check;
alter table public.keep_battle_arena_rounds add constraint keep_battle_arena_rounds_position_check check (position >= 1 and position <= 30);
