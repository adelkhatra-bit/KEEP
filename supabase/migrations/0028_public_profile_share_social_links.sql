-- La page publique KEEP ne doit lire que les réseaux explicitement marqués PUBLIC
-- d'un profil lui-même public. Les liens privés restent strictement invisibles.
drop policy if exists social_links_public_profile_read on public.social_links;
create policy social_links_public_profile_read on public.social_links
  for select
  using (
    visibility = 'PUBLIC'
    and exists (
      select 1
      from public.profiles p
      where p.id = social_links.profile_id
        and p.is_public = true
    )
  );
