-- P2 — Durcissement des fonctions SECURITY DEFINER exposées à anon
-- Auteur : Abacus Agent — 2026-09-22, sur GO explicite d'Adel.
-- Source de vérité : docs/security/P2_REVOKE_secdef_anon_REVIEW.sql
--
-- PRINCIPE :
--   PostgreSQL accorde EXECUTE à PUBLIC par défaut à toute CREATE FUNCTION.
--   anon ∈ PUBLIC → toute fonction non révoquée est appelable sans auth.
--   Ce script :
--     1. REVOKE EXECUTE FROM public, anon  pour toutes les fonctions SECURITY
--        DEFINER hors allowlist (≈ 205 fonctions).
--     2. Re-GRANT ciblé pour ne rien casser :
--        - service_*  → service_role uniquement
--        - autres     → authenticated + service_role
--
-- ALLOWLIST (34 fonctions, conservées ouvertes à anon — profils publics,
-- battles, événements, boutique, playlists, growth/referral/feature flags) :
--   keep_public_profile_snapshot, keep_public_profile_tracks,
--   keep_public_certification_tiers, keep_profile_discovery_impacts,
--   keep_profile_reprisers, keep_track_discovery_impact,
--   keep_artist_track_offers_for_profile, keep_payout_link_for_profile,
--   keep_battle_arena_rules, keep_battle_get_manual_availability,
--   keep_battle_global_leaderboard, keep_battle_profile_battle_stats,
--   keep_battle_solo_available, keep_battle_solo_pack, keep_battle_stake_for_rounds,
--   keep_event_review_summary, keep_event_reviews, keep_event_rsvp_counts,
--   keep_store_product_catalog, keep_plan_paddle_catalog, keep_plan_stripe_catalog,
--   keep_paddle_client_config, keep_stripe_client_config,
--   keep_playlist_sale_masked_track_ids, keep_playlist_sale_offer_details,
--   keep_playlist_sale_offer_preview_tracks, keep_playlist_sale_offers_for_profile,
--   keep_playlist_sale_track_ids,
--   keep_feature_flag_enabled_for_me, keep_growth_reward_status, keep_referral_rules,
--   keep_guest_device_credit_consume, keep_guest_device_credit_status,
--   keep_free_credit_breakdown_diagnostic
--
-- NE CASSE PAS :
--   - Reconnaissance musicale (service_role via edge functions)
--   - Auth / création profil (déjà durci, appelé en authenticated)
--   - App mobile / admin (fonctions client en authenticated ou dans l'allowlist)
--
-- IDEMPOTENT : revoke sur une permission inexistante = no-op en PG.

do $$
declare
  r record;
  allow text[] := array[
    'keep_public_profile_snapshot','keep_public_profile_tracks',
    'keep_public_certification_tiers','keep_profile_discovery_impacts',
    'keep_profile_reprisers','keep_track_discovery_impact',
    'keep_artist_track_offers_for_profile','keep_payout_link_for_profile',
    'keep_battle_arena_rules','keep_battle_get_manual_availability',
    'keep_battle_global_leaderboard','keep_battle_profile_battle_stats',
    'keep_battle_solo_available','keep_battle_solo_pack','keep_battle_stake_for_rounds',
    'keep_event_review_summary','keep_event_reviews','keep_event_rsvp_counts',
    'keep_store_product_catalog','keep_plan_paddle_catalog','keep_plan_stripe_catalog',
    'keep_paddle_client_config','keep_stripe_client_config',
    'keep_playlist_sale_masked_track_ids','keep_playlist_sale_offer_details',
    'keep_playlist_sale_offer_preview_tracks','keep_playlist_sale_offers_for_profile',
    'keep_playlist_sale_track_ids',
    'keep_feature_flag_enabled_for_me','keep_growth_reward_status','keep_referral_rules',
    'keep_guest_device_credit_consume','keep_guest_device_credit_status',
    'keep_free_credit_breakdown_diagnostic'
  ];
  n_revoked int := 0;
  sig text;
begin
  for r in
    select p.proname,
           format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef = true
      and p.proname <> all(allow)
  loop
    sig := r.sig;
    -- 1) couper l'accès non authentifié
    execute format('revoke execute on function %s from public', sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', sig);
    end if;
    -- 2) re-grant ciblé
    if r.proname like 'service\_%' then
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', sig);
      end if;
    else
      if exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute format('grant execute on function %s to authenticated', sig);
      end if;
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', sig);
      end if;
    end if;
    n_revoked := n_revoked + 1;
  end loop;
  raise notice 'P2 harden_secdef_anon : % fonctions SECURITY DEFINER révoquées de anon/public.', n_revoked;
end
$$;
