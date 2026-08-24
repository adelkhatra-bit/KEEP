-- KEEP — 0023: recherche utilisateur par e-mail pour le Super Admin
--
-- Gap réel trouvé le 24/08/2026 (Adel : "Dans le Super Admin, tu dois pouvoir
-- rechercher : Adresse e-mail : artiste@email.com") -- `GET /admin/users`
-- existant (packages/backend/src/routes/admin.ts) ne cherche que par
-- `profiles.username` (`profiles` ne stocke jamais l'email, volontairement,
-- voir 0001_core_identity.sql -- l'email vit uniquement dans `auth.users`,
-- schéma Supabase Auth géré, jamais dupliqué ailleurs).
--
-- `auth.users` n'est accessible à AUCUN client (anon/authenticated), même
-- admin -- seule une fonction SECURITY DEFINER peut légitimement le
-- traverser, même mécanisme déjà établi par `is_admin()` (0014). Cette
-- fonction ne renvoie JAMAIS `auth.users` en entier -- seulement id/username/
-- email/created_at pour les profils correspondants, et seulement pour un
-- appelant déjà admin (vérifié explicitement, pas juste "SECURITY DEFINER
-- donc safe").
-- BUG RÉEL trouvé pendant la vérification de cette même migration (24/08/2026) :
-- une première version en INNER JOIN retournait 0 résultat pour le compte
-- adel.khatra@live.fr lui-même -- son `auth.users` existe (compte réel,
-- rôle SUPER_ADMIN accordé), mais aucune ligne `profiles` n'existe encore
-- (jamais ouvert l'onglet Profil de l'app mobile). Un INNER JOIN aurait
-- rendu n'importe quel admin invisible à sa PROPRE recherche tant qu'il n'a
-- pas rempli son profil mobile. LEFT JOIN + username peut être NULL --
-- l'appelant (admin.ts) doit alors afficher l'email comme identifiant.
create or replace function admin_search_profiles(search_term text)
returns table (id uuid, username text, email text, display_name text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, p.username, u.email, p.display_name, u.created_at
  from auth.users u
  left join profiles p on p.id = u.id
  where is_admin(auth.uid())
    and (u.email ilike '%' || search_term || '%' or p.username ilike '%' || search_term || '%')
  order by u.created_at desc
  limit 50;
$$;

comment on function admin_search_profiles is 'Recherche Super Admin par e-mail OU pseudo -- SECURITY DEFINER nécessaire pour traverser auth.users, mais retourne un ensemble vide (jamais une erreur) si l''appelant n''est pas admin (voir is_admin() dans la clause where).';
