-- KEEP — 0013: lecture publique de remote_config, même précédent que
-- plans/plan_prices/features (0008_pricing_rls_and_remote_config.sql).
--
-- Pourquoi : `remote_config` était verrouillée "none" (aucun accès, même en
-- lecture, pour authenticated/anon) -- correct pour un réglage vraiment
-- interne, mais bloquant pour des valeurs que l'app DOIT lire à chaque
-- requête réelle (ex. guest_recognition_limit, cf. migration 0012) sans
-- dépendre de SUPABASE_SERVICE_ROLE_KEY (toujours un placeholder non
-- configuré dans cet environnement, voir packages/backend/.env -- ne pas
-- bloquer une fonctionnalité utilisateur sur une clé qui n'existe pas
-- encore). Écriture reste réservée au service role (aucune policy
-- insert/update/delete ajoutée ici) -- seule la lecture s'ouvre.
drop policy if exists remote_config_none on remote_config;
create policy remote_config_select_all on remote_config for select using (true);
