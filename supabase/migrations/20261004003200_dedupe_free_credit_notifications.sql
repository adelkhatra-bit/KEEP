-- Un gain de Free ne doit produire qu'une seule confirmation.
-- FREE_CREDITED reste la notification canonique pour les crédits Battle/Solo.
-- IMPORTANT : on ne supprime jamais l'historique utilisateur existant.
-- Le dédoublonnage s'applique uniquement aux nouvelles notifications en
-- désactivant les anciens triggers redondants.
drop trigger if exists trg_notify_free_solo_reward on public.keep_battle_solo_credit_events;
drop trigger if exists trg_notify_free_arena_reward on public.keep_battle_arena_credit_events;
drop trigger if exists trg_notify_free_duel_reward on public.keep_battle_credit_events;
