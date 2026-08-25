-- KEEP — 0009: champs du profil public + exposition contrôlée des réseaux sociaux
-- Le design public validé affiche site, goûts musicaux et icônes sociales.
-- Les données privées (date de naissance / genre) restent dans profile_private_info.

alter table profiles
  add column if not exists website text,
  add column if not exists favorite_genres text[] not null default '{}',
  add column if not exists favorite_artists text[] not null default '{}';

-- La policy initiale social_links_owner empêchait tout autre utilisateur de
-- voir les liens, même marqués PUBLIC. On conserve l'accès propriétaire et
-- on ajoute une lecture strictement limitée aux liens PUBLIC de profils publics.
create policy social_links_select_public_profile on social_links
  for select using (
    visibility = 'PUBLIC'
    and exists (
      select 1 from profiles p
      where p.id = social_links.profile_id
        and p.is_public = true
    )
  );

create index if not exists idx_social_links_public_profile
  on social_links(profile_id, visibility);
