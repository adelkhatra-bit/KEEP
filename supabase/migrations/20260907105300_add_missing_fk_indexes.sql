-- Audit multi-agent 07/09/2026 (juge charge/scalabilite) : cles etrangeres sans
-- index couvrant sur les tables Battle/transactions qui portent le trafic
-- temps reel du jeu -- toute requete filtrant/joignant sur ces colonnes
-- degenere en scan sequentiel des que la table depasse quelques dizaines de
-- milliers de lignes (classement d'une arene, historique d'un joueur...).
-- Tables encore petites aujourd'hui (quelques milliers de lignes max) :
-- CREATE INDEX classique (bloquant mais quasi instantane), pas CONCURRENTLY
-- (incompatible avec le mode transactionnel du runner de migration).

CREATE INDEX IF NOT EXISTS idx_keep_battle_arena_answers_profile_id ON public.keep_battle_arena_answers (profile_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_arena_rounds_track_id ON public.keep_battle_arena_rounds (track_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_arenas_host_id ON public.keep_battle_arenas (host_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_arenas_theme_code ON public.keep_battle_arenas (theme_code);
CREATE INDEX IF NOT EXISTS idx_keep_battle_challenges_arena_id ON public.keep_battle_challenges (arena_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_moves_player_id ON public.keep_battle_moves (player_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_rounds_track_id ON public.keep_battle_rounds (track_id);
CREATE INDEX IF NOT EXISTS idx_keep_battle_track_themes_theme_code ON public.keep_battle_track_themes (theme_code);
CREATE INDEX IF NOT EXISTS idx_transactions_country_code ON public.transactions (country_code);
CREATE INDEX IF NOT EXISTS idx_transactions_subscription_id ON public.transactions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_grants_granted_by ON public.admin_credit_grants (granted_by);
