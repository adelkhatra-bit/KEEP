-- Adel (02/10/2026) : « les testeurs créés n'ont pas besoin d'être visibles
-- pour les utilisateurs ». Cause : la recherche de personnes du tchat (inviter
-- dans un groupe) listait TOUS les profils publics par ordre alphabétique,
-- sans tenir compte de discovery_hidden : les comptes de test des audits
-- (audittest…, browseruse_test, cleantest…) apparaissaient en tête de liste.
-- Désormais un profil caché n'y apparaît que pour une personne avec qui il a
-- déjà un lien d'abonnement (dans un sens ou dans l'autre).
-- Additif : aucune donnée modifiée.

create or replace function public.keep_agora_group_people_search(p_query text default ''::text, p_limit integer default 30)
 returns table(profile_id uuid, username text, avatar_url text)
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
  with needle as (
    select lower(btrim(coalesce(p_query,''))) as q
  )
  select p.id, p.username, p.avatar_url
  from public.profiles p
  cross join needle n
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.is_public = true
    and (
      coalesce(p.discovery_hidden, false) = false
      or exists (
        select 1 from public.follows f
        where (f.follower_id = auth.uid() and f.followee_id = p.id)
           or (f.followee_id = auth.uid() and f.follower_id = p.id)
      )
    )
    and (
      n.q = ''
      or lower(p.username) like replace(replace(n.q, '%', '\%'), '_', '\_') || '%' escape '\'
      or lower(coalesce(p.display_name,'')) like replace(replace(n.q, '%', '\%'), '_', '\_') || '%' escape '\'
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by
    case when exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.followee_id = p.id)
         or (f.followee_id = auth.uid() and f.follower_id = p.id)
    ) then 0 else 1 end,
    lower(p.username)
  limit least(greatest(coalesce(p_limit,30),1),60);
$function$;
