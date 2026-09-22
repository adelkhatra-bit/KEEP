-- =============================================================================
-- P2 — Durcissement des fonctions SECURITY DEFINER exposées à anon
-- FICHIER DE REVUE — NE PAS APPLIQUER SANS LE "GO" D'ADEL.
-- Placé volontairement hors de supabase/migrations/ pour NE PAS s'exécuter
-- automatiquement au déploiement.
-- =============================================================================
--
-- CONTEXTE / RACINE DU PROBLÈME
--   En PostgreSQL, `CREATE FUNCTION` accorde par défaut EXECUTE à PUBLIC.
--   anon étant membre de PUBLIC, TOUTE fonction non explicitement révoquée est
--   appelable sans authentification via /rest/v1/rpc/<nom> avec la clé anon.
--   Audit du repo (grep source de vérité = supabase/migrations/*.sql) :
--     - 239 fonctions SECURITY DEFINER (schéma public)
--     -  34 explicitement GRANT ... TO anon  → surface publique VOULUE (allowlist ci-dessous)
--     - 210 non explicitement ouvertes à anon MAIS potentiellement joignables
--           par défaut via PUBLIC (≈ le chiffre « 179 » signalé, moins celles déjà
--           durcies par les blocs `revoke ... from public` existants).
--
-- CE QUE FAIT CE SCRIPT (idempotent, réversible)
--   Pour chaque fonction SECURITY DEFINER du schéma public NON présente dans
--   l'allowlist :
--     1. REVOKE EXECUTE FROM public, anon   (bloque l'appel non authentifié)
--     2. Re-GRANT ciblé pour ne RIEN casser côté app :
--        - fonctions préfixées service_*  → service_role uniquement
--        - toutes les autres              → authenticated + service_role
--   L'allowlist (34 fonctions) reste inchangée : profils publics, catalogues,
--   règles de battle, avis d'événements, config paiement client, etc.
--
-- NE CASSE PAS :
--   - Reconnaissance musicale : passe par service_role (edge functions), et
--     service_lookup_fingerprint_hashes est déjà révoquée de anon (migration
--     20260920150000_harden_service_rpc_grants.sql).
--   - Auth / création de profil : keep_create_profile_from_auth_user est déjà
--     durcie et appelée en tant qu'authenticated.
--   - App mobile/admin : les fonctions client tournent en authenticated (grant
--     conservé) ou sont dans l'allowlist.
--
-- ⚠️ À REVOIR AVANT GO (fonctions dans l'allowlist anon qui méritent une décision) :
--   - keep_guest_device_credit_consume  → fonction MUTANTE ouverte à anon
--       (consomme un crédit invité). Vérifier le rate-limit / anti-abus.
--   - keep_playlist_sale_track_ids      → renvoie les IDs de pistes NON masqués ;
--       une variante *_masked_track_ids existe. Confirmer que la version claire
--       doit rester pré-achat pour anon (sinon retirer de l'allowlist).
--   - keep_free_credit_breakdown_diagnostic → « diagnostic » exposé à anon :
--       confirmer que c'est voulu (sinon retirer de l'allowlist).
-- =============================================================================

do $$
declare
  r record;
  allow text[] := array[
    -- Profils publics & découverte
    'keep_public_profile_snapshot','keep_public_profile_tracks',
    'keep_public_certification_tiers','keep_profile_discovery_impacts',
    'keep_profile_reprisers','keep_track_discovery_impact',
    'keep_artist_track_offers_for_profile','keep_payout_link_for_profile',
    -- Battles (arène / classement / règles publiques)
    'keep_battle_arena_rules','keep_battle_get_manual_availability',
    'keep_battle_global_leaderboard','keep_battle_profile_battle_stats',
    'keep_battle_solo_available','keep_battle_solo_pack','keep_battle_stake_for_rounds',
    -- Événements (avis / RSVP publics)
    'keep_event_review_summary','keep_event_reviews','keep_event_rsvp_counts',
    -- Boutique / plans / config paiement côté client
    'keep_store_product_catalog','keep_plan_paddle_catalog','keep_plan_stripe_catalog',
    'keep_paddle_client_config','keep_stripe_client_config',
    -- Vente de playlists (aperçu / masqué avant achat)
    'keep_playlist_sale_masked_track_ids','keep_playlist_sale_offer_details',
    'keep_playlist_sale_offer_preview_tracks','keep_playlist_sale_offers_for_profile',
    'keep_playlist_sale_track_ids',
    -- Growth / referral / feature flags / crédits invités
    'keep_feature_flag_enabled_for_me','keep_growth_reward_status','keep_referral_rules',
    'keep_guest_device_credit_consume','keep_guest_device_credit_status',
    'keep_free_credit_breakdown_diagnostic'
  ];
  n_revoked int := 0;
begin
  for r in
    select p.oid,
           p.proname,
           format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef = true            -- SECURITY DEFINER uniquement
      and p.proname <> all(allow)       -- hors allowlist
  loop
    -- 1) couper l'accès non authentifié
    execute format('revoke execute on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', r.sig);
    end if;
    -- 2) re-grant ciblé pour ne rien casser
    if r.proname like 'service\_%' then
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', r.sig);
      end if;
    else
      if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute format('grant execute on function %s to authenticated', r.sig);
      end if;
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', r.sig);
      end if;
    end if;
    n_revoked := n_revoked + 1;
  end loop;
  raise notice 'P2 durcissement : % fonctions SECURITY DEFINER révoquées de anon/public.', n_revoked;
end
$$;

-- =============================================================================
-- VÉRIFICATION post-application (à lancer après GO) :
--   Doit renvoyer 0 ligne hors allowlist.
-- =============================================================================
-- select p.proname
-- from pg_proc p
-- join pg_namespace ns on ns.oid = p.pronamespace
-- where ns.nspname='public' and p.prosecdef
--   and has_function_privilege('anon', p.oid, 'EXECUTE')
-- order by 1;
