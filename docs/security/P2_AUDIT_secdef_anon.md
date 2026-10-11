# P2 — Audit des fonctions SECURITY DEFINER exposées à `anon`

_Auteur : Abacus Agent — 2026-09-22 — source de vérité : `supabase/migrations/*.sql` (345 fichiers)._

## Résumé

| Mesure | Valeur |
|---|---|
| Fonctions `SECURITY DEFINER` (schéma `public`) | **239** |
| Explicitement `GRANT … TO anon` (surface publique voulue) | **34** |
| Sans grant anon explicite mais joignables par défaut via `PUBLIC` | **≈ 210** |
| Déjà durcies par un bloc `revoke … from public` existant | ~19 familles |

## Pourquoi « 179 fonctions exposées »

En PostgreSQL, `CREATE FUNCTION` accorde **par défaut `EXECUTE` à `PUBLIC`**. Le rôle `anon`
(clé publique de l'app) étant membre de `PUBLIC`, **toute fonction non explicitement révoquée
est appelable sans authentification** via `POST /rest/v1/rpc/<nom>`.

Le chiffre « 179 » correspond donc aux fonctions `SECURITY DEFINER` qui conservent encore ce
grant `PUBLIC` par défaut (≈ 210 candidates moins celles déjà durcies). Ce ne sont pas
seulement les 34 volontairement publiques — c'est l'ensemble des fonctions internes qui fuient
par défaut.

## 1. Surface publique VOULUE — allowlist (34 fonctions, à CONSERVER)

Ces fonctions sont des lectures publiques légitimes (ou de la config client) et doivent rester
ouvertes à `anon` :

- **Profils publics & découverte** : `keep_public_profile_snapshot`, `keep_public_profile_tracks`,
  `keep_public_certification_tiers`, `keep_profile_discovery_impacts`, `keep_profile_reprisers`,
  `keep_track_discovery_impact`, `keep_artist_track_offers_for_profile`, `keep_payout_link_for_profile`
- **Battles** : `keep_battle_arena_rules`, `keep_battle_get_manual_availability`,
  `keep_battle_global_leaderboard`, `keep_battle_profile_battle_stats`, `keep_battle_solo_available`,
  `keep_battle_solo_pack`, `keep_battle_stake_for_rounds`
- **Événements** : `keep_event_review_summary`, `keep_event_reviews`, `keep_event_rsvp_counts`
- **Boutique / plans / config paiement client** : `keep_store_product_catalog`,
  `keep_plan_paddle_catalog`, `keep_plan_stripe_catalog`, `keep_paddle_client_config`,
  `keep_stripe_client_config`
- **Vente de playlists (aperçu / masqué)** : `keep_playlist_sale_masked_track_ids`,
  `keep_playlist_sale_offer_details`, `keep_playlist_sale_offer_preview_tracks`,
  `keep_playlist_sale_offers_for_profile`, `keep_playlist_sale_track_ids`
- **Growth / referral / feature flags / crédits invités** : `keep_feature_flag_enabled_for_me`,
  `keep_growth_reward_status`, `keep_referral_rules`, `keep_guest_device_credit_consume`,
  `keep_guest_device_credit_status`, `keep_free_credit_breakdown_diagnostic`

### ⚠️ 3 fonctions de l'allowlist à ARBITRER avant GO

1. **`keep_guest_device_credit_consume`** — fonction **mutante** ouverte à `anon` (consomme un
   crédit invité). Risque d'abus si pas de rate-limit / empreinte device robuste.
2. **`keep_playlist_sale_track_ids`** — renvoie les IDs de pistes **non masqués** ; une variante
   `*_masked_track_ids` existe. Confirmer qu'exposer la version claire avant achat est voulu.
3. **`keep_free_credit_breakdown_diagnostic`** — un « diagnostic » exposé à `anon` : confirmer
   que c'est intentionnel, sinon le retirer de l'allowlist.

## 2. À DURCIR — ~205 fonctions hors allowlist

Toutes les autres fonctions `SECURITY DEFINER` (dont 15 préfixées `service_*` = service_role
uniquement) ne devraient PAS être appelables par `anon`. Le fichier de revue
`P2_REVOKE_secdef_anon_REVIEW.sql` :

1. `REVOKE EXECUTE FROM public, anon` pour chacune (bloque l'accès non authentifié) ;
2. re-`GRANT` ciblé pour ne rien casser :
   - `service_*` → `service_role` uniquement ;
   - autres → `authenticated` + `service_role`.

Le script est **dynamique** (interroge `pg_proc` à l'exécution) et **idempotent** — pas besoin de
lister 205 signatures à la main, il suit la même convention que la migration de durcissement déjà
présente (`20260920150000_harden_service_rpc_grants.sql`).

## 3. Ce qui NE casse PAS

- **Reconnaissance musicale** : via `service_role` (edge functions) ; `service_lookup_fingerprint_hashes`
  déjà révoquée de `anon`.
- **Auth / création de profil** : `keep_create_profile_from_auth_user` déjà durcie, appelée en `authenticated`.
- **App mobile / admin** : fonctions client en `authenticated` (grant conservé) ou dans l'allowlist.

## 4. Procédure recommandée (après GO)

1. Adel valide l'allowlist (et arbitre les 3 fonctions ci-dessus).
2. Copier le contenu de `P2_REVOKE_secdef_anon_REVIEW.sql` dans un **nouveau** fichier
   `supabase/migrations/<timestamp>_p2_harden_secdef_anon.sql` (pour versionnement + déploiement).
3. Appliquer en **staging** d'abord, lancer un smoke test app (login, reconnaissance, achat, profil public).
4. Exécuter la requête de vérification finale (en bas du fichier SQL) → doit renvoyer 0 ligne hors allowlist.
5. Déployer en prod.

> **⛔ Aucune révocation n'a été appliquée.** Ce sont des livrables de revue. En attente du GO d'Adel.
