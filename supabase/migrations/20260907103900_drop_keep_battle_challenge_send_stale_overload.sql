-- Audit multi-agent 07/09/2026 (juge base de donnees) : meme piege que celui deja corrige
-- pour keep_battle_arena_create (20260904212124). Un CREATE OR REPLACE avec une nouvelle
-- signature (ajout de p_round_count) a cree une DEUXIEME surcharge au lieu de remplacer
-- l'ancienne. L'ancienne surcharge a 2 arguments n'appelle jamais
-- keep_battle_challenge_daily_send_cap_check -- un appel avec seulement
-- {p_target_id, p_theme_code} (sans p_round_count) contourne donc la limite quotidienne
-- de defis Battle envoyes (battle_invites_per_day). On supprime l'ancienne surcharge.

DROP FUNCTION IF EXISTS public.keep_battle_challenge_send(uuid, text);
