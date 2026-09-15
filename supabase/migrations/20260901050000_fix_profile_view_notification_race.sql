-- BUG RÉEL trouvé le 01/09/2026 (Adel, capture d'écran : deux notifications
-- "Visite de ton profil" pour le même visiteur à la même seconde exacte).
-- notify_profile_view() faisait un "not exists (...) then insert" sans
-- aucun verrou : deux appels concurrents pour le même (visiteur, profil
-- visité) passent tous les deux la vérification avant que l'un des deux
-- n'ait validé son insertion (race condition classique
-- check-then-act). Cause côté client corrigée séparément
-- (PublicUserProfileScreen.tsx appelait load() deux fois au premier
-- affichage), mais le vrai garde-fou doit être ici : un verrou consultatif
-- transactionnel, clé sur la paire (profil visité, visiteur), qui sérialise
-- les appels concurrents avant même la vérification anti-doublon.

create or replace function public.notify_profile_view(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_username text;
  social_allowed boolean := true;
begin
  if viewer_id is null then
    return;
  end if;
  if target_profile_id is null or target_profile_id = viewer_id then
    return;
  end if;

  -- Sérialise les appels concurrents pour cette paire (profil, visiteur) :
  -- le second appel attend que le premier ait fini (et donc inséré) avant
  -- de faire sa propre vérification anti-doublon, qui la trouvera alors.
  perform pg_advisory_xact_lock(hashtextextended(target_profile_id::text || ':' || viewer_id::text, 0));

  if not exists (select 1 from public.profiles where id = target_profile_id and is_public = true) then
    return;
  end if;

  select username into viewer_username from public.profiles where id = viewer_id;
  if viewer_username is null then
    return;
  end if;

  select coalesce(np.social_enabled, true)
    into social_allowed
    from public.notification_preferences np
   where np.profile_id = target_profile_id;
  social_allowed := coalesce(social_allowed, true);

  if social_allowed and not exists (
    select 1
      from public.notifications n
     where n.profile_id = target_profile_id
       and n.type = 'profile_view'
       and n.data->>'viewer_id' = viewer_id::text
       and n.created_at > now() - interval '12 hours'
  ) then
    insert into public.notifications(profile_id, type, title, body, data)
    values (
      target_profile_id,
      'profile_view',
      'Visite de ton profil',
      '@' || viewer_username || ' a consulté ton profil Loki.',
      jsonb_build_object('viewer_id', viewer_id, 'viewer_username', viewer_username)
    );
  end if;
end;
$$;
