-- KEEP — 0021: lecture publique des réseaux sociaux visibility='PUBLIC'
--
-- Bug confirmé le 24/08/2026 par un test réel à 2 utilisateurs
-- (packages/backend/scripts/rls-social-links-test.ts, AVANT cette migration :
-- 5/7 PASS, SOCIAL_LINKS_BUG_BEFORE_FIX et PUBLIC_PROFILE_SOCIAL_LINKS en FAIL) :
-- la policy `social_links_owner` (0006_rls.sql, `for all using (profile_id =
-- auth.uid())`) bloque TOUTE lecture pour un non-propriétaire, y compris les
-- lignes `visibility = 'PUBLIC'` que `fetchSocialLinks()`
-- (packages/backend/src/routes/social.ts) tente déjà de filtrer côté
-- application -- RLS s'évalue AVANT ce filtre applicatif, donc un visiteur
-- d'un profil PUBLIC ne voyait jamais ses réseaux sociaux, même publics.
--
-- Même précédent que 0013_remote_config_public_select.sql : seule la LECTURE
-- s'ouvre. Deux conditions cumulatives (jamais l'une sans l'autre) :
--   1. le lien lui-même est visibility = 'PUBLIC' (jamais PRIVATE)
--   2. le PROFIL qui le porte est lui-même is_public = true
-- (2) est nécessaire en plus de (1) : sans elle, un lien marqué PUBLIC sur un
-- profil par ailleurs PRIVATE resterait lisible en direct via la table
-- (PostgREST/Supabase client), même si la route /profiles/:username elle-même
-- 404 avant d'y arriver (profiles_select_own_or_public) -- défense en
-- profondeur, même style que playlist_tracks_via_playlist plus bas dans
-- 0006_rls.sql (jointure vers la table parente pour vérifier la visibilité
-- réelle plutôt que de faire confiance à l'ordre des routes applicatives).
--
-- L'écriture reste exclusivement réservée au propriétaire -- `social_links_owner`
-- couvre toujours insert/update/delete via son `with check`, inchangé.
create policy social_links_select_public on social_links
  for select using (
    visibility = 'PUBLIC'
    and exists (select 1 from profiles p where p.id = social_links.profile_id and p.is_public)
  );
