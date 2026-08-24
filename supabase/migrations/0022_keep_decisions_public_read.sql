-- KEEP — 0022: lecture publique des morceaux KEPT visibility='PUBLIC'
--
-- Bug de la même famille que 0021_social_links_public_read.sql, trouvé le
-- 24/08/2026 par un vrai test round-trip (créer un KEEP PUBLIC, tenter de le
-- lire en tant que visiteur d'un profil public -- 0 résultat au lieu de 1) en
-- implémentant le toggle partager/masquer par morceau demandé par Adel.
--
-- `keep_decisions_owner` (0006_rls.sql, `for all using (profile_id =
-- auth.uid())`) bloque TOUTE lecture pour un non-propriétaire, y compris les
-- lignes `visibility = 'PUBLIC'` que `GET /profiles/:username/keeps`
-- (packages/backend/src/routes/social.ts) filtre déjà côté application --
-- RLS s'évalue avant ce filtre. Résultat concret : "Écoutés récemment" /
-- découvertes réelles n'a jamais pu s'afficher sur AUCUN profil visité,
-- même public, même avec des morceaux explicitement marqués PUBLIC.
--
-- Même garde-fou double condition que 0021 : le morceau doit être
-- explicitement `decision='KEPT'` ET `visibility='PUBLIC'`, ET le PROFIL
-- parent doit lui-même être `is_public` (jointure vers `profiles`, défense
-- en profondeur -- jamais confiance seule dans l'ordre des routes
-- applicatives). L'écriture reste exclusivement réservée au propriétaire
-- (`keep_decisions_owner` inchangée, couvre toujours insert/update/delete).
create policy keep_decisions_select_public on keep_decisions
  for select using (
    decision = 'KEPT'
    and visibility = 'PUBLIC'
    and exists (select 1 from profiles p where p.id = keep_decisions.profile_id and p.is_public)
  );
