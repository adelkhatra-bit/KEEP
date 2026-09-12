-- Audit multi-agent 07/09/2026 (juge securite + juge base de donnees) : ces 4 fonctions
-- SECURITY DEFINER acceptent un p_uid libre sans jamais verifier que l'appelant EST ce
-- p_uid, et sont GRANTees a anon/authenticated -> n'importe qui, meme sans compte, peut
-- lire le solde de credits Free, les bonus de parrainage/croissance et le total de credits
-- accordes par un admin, pour n'importe quel profil KEEP.
--
-- Seul appelant legitime trouve dans tout le repo : supabase/functions/keep-admin-user-control
-- (via le client service_role, protege par requireAdmin()) + les autres RPC SECURITY DEFINER
-- de credit qui les appellent en interne (keep_battle_arena_lock_stake, keep_free_credit_breakdown,
-- keep_download_credit_status...). Ni l'un ni l'autre n'a besoin du GRANT anon/authenticated :
-- service_role l'ignore, et un appel interne depuis une fonction SECURITY DEFINER s'execute
-- avec les droits du proprietaire de cette fonction, pas ceux de l'appelant SQL d'origine.
-- Aucun appel direct '.rpc(...)' cote client mobile/admin sur ces 4 noms (verifie par grep).

revoke execute on function public.keep_theoretical_free_credit_remaining_for_profile(uuid) from anon, authenticated;
revoke execute on function public.keep_growth_free_credit_bonus_for_profile(uuid) from anon, authenticated;
revoke execute on function public.keep_referral_free_credit_bonus_for_profile(uuid) from anon, authenticated;
revoke execute on function public.keep_admin_credit_grant_total_for_profile(uuid) from anon, authenticated;

grant execute on function public.keep_theoretical_free_credit_remaining_for_profile(uuid) to service_role;
grant execute on function public.keep_growth_free_credit_bonus_for_profile(uuid) to service_role;
grant execute on function public.keep_referral_free_credit_bonus_for_profile(uuid) to service_role;
grant execute on function public.keep_admin_credit_grant_total_for_profile(uuid) to service_role;
