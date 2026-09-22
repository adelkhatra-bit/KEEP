-- =============================================================================
-- KEEP — B6 : politiques RLS de revue (À VALIDER, NE PAS APPLIQUER TEL QUEL)
-- Généré le 22/09/2026 — audit de supabase/migrations/ (107 tables)
-- Projet Supabase : rrhqsqzcplvmwxizqnla (actif)
-- =============================================================================
--
-- RÉSULTAT DE L'AUDIT (important, à lire avant toute exécution)
-- -----------------------------------------------------------------------------
-- Contrairement à l'hypothèse « RLS manquante », l'audit statique de TOUTES les
-- migrations montre que :
--
--   * 107 tables `create table` détectées dans public.*
--   * 107 ont `enable row level security` (0 table SANS RLS)
--   * 0 table avec une policy mais RLS désactivée (aucune policy inerte)
--   * Les tables sensibles explicitement visées par la mission sont DÉJÀ
--     verrouillées en deny-all (service_role uniquement) dans
--     0008_pricing_rls_and_remote_config.sql :
--        - operating_costs  -> `create policy operating_costs_none ... for all using (false)`
--        - promo_codes      -> `create policy promo_codes_none ... for all using (false)`
--        - promotions       -> `create policy promotions_none ... for all using (false)`
--     (aucune table `codes_promo` n'existe ; le nom réel est `promo_codes`.)
--   * Les tables marketplace / attribution / ventes portent déjà des policies
--     « propriétaire » (owner-scoped) :
--        - playlist_sale_offers / playlist_sale_payments (seller_id/buyer_id)
--        - artist_original_tracks / artist_track_orders   (seller_id/buyer_id)
--        - event_ticket_orders                            (seller_id/buyer_id)
--        - keep_referral_codes / keep_referrals           (profile_id)
--        - admin_credit_grants                            (profile_id)
--     Convention confirmée : profiles.id = auth.users.id, donc le test de
--     propriété est `<colonne> = auth.uid()`.
--
-- CONCLUSION : il n'y a AUCUNE table publiquement exposée sans protection.
-- 39 tables sont en « RLS activée + AUCUNE policy » = deny-all par défaut
-- (accès refusé à anon/authenticated, seul le service_role — Edge Functions /
-- backend — y accède). C'est un état SÛR, pas une fuite.
--
-- OBJET DE CE FICHIER
-- -----------------------------------------------------------------------------
-- 1) PART A : garde défensive idempotente — (ré)active RLS sur toute table
--    publique qui n'en aurait pas (utile pour les futures migrations).
--    -> Ne DÉVERROUILLE rien : on peut l'appliquer sans risque de fuite.
--
-- 2) PART B : policies « propriétaire » OPTIONNELLES et COMMENTÉES, pour les
--    tables actuellement en deny-all qui portent une colonne propriétaire.
--    -> À n'activer QUE si un écran client lit réellement la table en direct
--       (au lieu de passer par une Edge Function service_role). Chaque bloc
--       applique le principe du moindre privilège : SELECT limité au
--       propriétaire (`= auth.uid()`), les données des autres restent bloquées.
--    -> LAISSÉ COMMENTÉ EXPRÈS : les décommenter LOOSERAIT la sécurité. Un
--       humain doit valider table par table le besoin fonctionnel réel.
--
-- 3) PART C : tables internes/service à GARDER en deny-all (aucune action).
--
-- =============================================================================


-- =============================================================================
-- PART A — GARDE DÉFENSIVE : activer RLS partout (idempotent, sûr)
-- =============================================================================
-- N'ouvre aucun accès. Verrouille toute table publique qui n'aurait pas RLS.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security;', r.relname);
    raise notice 'RLS activée sur public.% (était désactivée)', r.relname;
  end loop;
end $$;


-- =============================================================================
-- PART B — POLICIES PROPRIÉTAIRE OPTIONNELLES (COMMENTÉES — À VALIDER)
-- =============================================================================
-- Décommenter UNIQUEMENT les tables réellement lues côté client authentifié.
-- Test de propriété : profiles.id = auth.uid(). Admin autorisé via
-- public.is_admin(auth.uid()) (fonction déjà utilisée dans le schéma).
--
-- ---- B.1 Tables à colonne `profile_id` (accès au propriétaire) --------------
-- (Ré)cupération/identité, compteurs et présence de battle liés à l'utilisateur.
--
-- create policy account_email_verifications_read_own      on public.account_email_verifications      for select to authenticated using (profile_id = auth.uid());
-- create policy account_recovery_events_read_own          on public.account_recovery_events          for select to authenticated using (profile_id = auth.uid());
-- create policy account_recovery_methods_read_own         on public.account_recovery_methods         for select to authenticated using (profile_id = auth.uid());
-- create policy event_recommendation_sends_read_own       on public.event_recommendation_sends       for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_arena_answers_read_own        on public.keep_battle_arena_answers        for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_arena_credit_events_read_own  on public.keep_battle_arena_credit_events  for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_arena_credit_holds_read_own   on public.keep_battle_arena_credit_holds   for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_arena_match_results_read_own  on public.keep_battle_arena_match_results  for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_arena_members_read_own        on public.keep_battle_arena_members        for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_credit_events_read_own        on public.keep_battle_credit_events        for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_solo_presence_read_own        on public.keep_battle_solo_presence        for select to authenticated using (profile_id = auth.uid());
-- create policy keep_battle_stats_read_own                on public.keep_battle_stats                for select to authenticated using (profile_id = auth.uid());
-- create policy music_provider_connections_read_own       on public.music_provider_connections       for select to authenticated using (profile_id = auth.uid());
-- create policy music_recognition_attempts_read_own       on public.music_recognition_attempts       for select to authenticated using (profile_id = auth.uid());
-- create policy music_usage_counters_read_own             on public.music_usage_counters             for select to authenticated using (profile_id = auth.uid());
-- create policy push_delivery_attempts_read_own           on public.push_delivery_attempts           for select to authenticated using (profile_id = auth.uid());
-- create policy user_data_revision_log_read_own           on public.user_data_revision_log           for select to authenticated using (profile_id = auth.uid());
--
-- ---- B.2 Tables à colonne `host_id` / `challenger_id` (battle) --------------
-- create policy keep_battle_arenas_read_own   on public.keep_battle_arenas   for select to authenticated using (host_id = auth.uid());
-- create policy keep_battle_challenges_read_own on public.keep_battle_challenges for select to authenticated using (challenger_id = auth.uid());
-- create policy keep_battles_read_own         on public.keep_battles         for select to authenticated using (challenger_id = auth.uid());
--
-- ---- B.3 Tables SENSIBLES (financier / audit / facturation) -----------------
-- RECOMMANDATION : GARDER en deny-all. N'activer une lecture propriétaire que
-- si un écran « historique d'achats / crédits » du client l'exige vraiment.
-- create policy free_credit_audit_log_read_own on public.free_credit_audit_log for select to authenticated using (profile_id = auth.uid());
-- create policy store_purchase_events_read_own on public.store_purchase_events for select to authenticated using (profile_id = auth.uid());
-- create policy product_events_read_own        on public.product_events        for select to authenticated using (profile_id = auth.uid());
-- create policy email_queue_read_own           on public.email_queue           for select to authenticated using (user_id = auth.uid());


-- =============================================================================
-- PART C — TABLES INTERNES / SERVICE : GARDER EN DENY-ALL (aucune action)
-- =============================================================================
-- Ces tables n'ont pas de colonne propriétaire exploitable côté client et sont
-- alimentées/lues exclusivement par le service_role (Edge Functions / backend).
-- Les laisser en deny-all est le comportement sécurisé attendu :
--   admin_bootstrap_tokens, ai_relay_messages, email_delivery_events,
--   integration_runtime_status, integration_secrets, keep_auto_repair_log,
--   keep_battle_arena_rounds, keep_battle_moves, keep_battle_rounds,
--   keep_battle_themes, keep_battle_track_themes, keep_internal_worker_secrets,
--   profile_music_notification_sends, profile_share_emails,
--   keep_guest_device_credit_usage (basée device_id, pas auth.uid()).
-- =============================================================================
-- FIN
