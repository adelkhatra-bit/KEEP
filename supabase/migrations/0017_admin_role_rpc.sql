-- KEEP — 0017: vérification du rôle admin sans service_role (cf. audit du
-- 24/08/2026 -- SUPABASE_SERVICE_ROLE_KEY toujours un placeholder non-null
-- dans packages/backend/.env, donc getSupabaseAdminClient() construit un
-- client avec une clé invalide au lieu de renvoyer null : CONFIGURED=true à
-- tort, et checkAdminRole() échoue silencieusement sur CHAQUE requête
-- (403 "not_admin" même pour un vrai admin) -- Super Admin est donc
-- actuellement inutilisable dans son ensemble, pas seulement partiellement
-- dégradé. Cette fonction débloque un chemin RLS+jeton (comme is_admin(),
-- migration 0014) pour le nouveau flux d'accès offert, sans dépendre de ce
-- service_role manquant. Auto-scopée à l'appelant (auth.uid()) -- ne permet
-- JAMAIS de vérifier le rôle de quelqu'un d'autre, contrairement à
-- is_admin(uid) qui prend un paramètre.
create or replace function get_my_admin_role()
returns admin_role
language sql
security definer
set search_path = public
stable
as $$
  select role from admin_users where id = auth.uid() and is_active;
$$;
