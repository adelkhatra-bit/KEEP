-- Adel (29/09/2026) : « audit complet des notifications… pourquoi il y a
-- des doublons, c'est vraiment gênant ».
-- Audit : ~150 points d'insertion dans public.notifications, aucune clé
-- d'unicité. Deux déclencheurs (ou un double appel client/réseau) pour le
-- même événement créaient deux lignes -> deux bannières + deux push.
-- Garde générique : une notification STRICTEMENT identique (même
-- destinataire, type, titre, texte et données) arrivée dans les 10 dernières
-- minutes n'est pas recréée. Des événements distincts (autre arène, autre
-- abonné, autre offre…) ont des données différentes et passent toujours.
create index if not exists notifications_profile_type_created_idx
  on public.notifications(profile_id, type, created_at desc);

create or replace function public.keep_notifications_skip_duplicate()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.notifications n
    where n.profile_id = new.profile_id
      and n.type = new.type
      and n.created_at > now() - interval '10 minutes'
      and coalesce(n.title, '') = coalesce(new.title, '')
      and coalesce(n.body, '') = coalesce(new.body, '')
      and coalesce(n.data, '{}'::jsonb) = coalesce(new.data, '{}'::jsonb)
  ) then
    return null; -- doublon : on ne l'insère pas
  end if;
  return new;
end $$;

drop trigger if exists keep_notifications_skip_duplicate on public.notifications;
create trigger keep_notifications_skip_duplicate
  before insert on public.notifications
  for each row execute function public.keep_notifications_skip_duplicate();
