-- Adel (02/10/2026) : « le tchat est lent, je suis obligé de rafraîchir ».
-- Cause : music_agora_messages (La Place + messages privés) a RLS activé SANS
-- aucune règle de lecture : Supabase Realtime ne livre donc JAMAIS les
-- nouveaux messages ; seul le filet de rechargement (2,5 s, en file réseau)
-- les faisait apparaître.
--
-- Correctif, en ne donnant accès qu'aux colonnes nécessaires au signal
-- temps réel (jamais le corps, ni le morceau partagé : un morceau MASQUÉ
-- d'une vente ne doit pas pouvoir être identifié en lecture directe) :
-- - La Place : visible par tout compte connecté (déjà publique dans l'app) ;
-- - message privé : visible uniquement par son auteur et son destinataire.
-- Les messages restent chargés par les fonctions sécurisées existantes.
--
-- Même protection pour les groupes : la lecture directe était ouverte sur
-- TOUTES les colonnes (dont shared_track_id) pour les membres -> limitée aux
-- colonnes du signal temps réel.
-- Additif / restrictif uniquement : aucune donnée modifiée ni supprimée.

drop policy if exists music_agora_messages_realtime_select on public.music_agora_messages;
create policy music_agora_messages_realtime_select
on public.music_agora_messages
for select
to authenticated
using (
  (target_profile_id is null and moderation_status = 'VISIBLE')
  or profile_id = (select auth.uid())
  or target_profile_id = (select auth.uid())
);

revoke select on public.music_agora_messages from authenticated;
grant select (id, room_slug, profile_id, target_profile_id, created_at, moderation_status)
  on public.music_agora_messages to authenticated;

revoke select on public.music_agora_group_messages from authenticated;
grant select (id, group_id, profile_id, created_at)
  on public.music_agora_group_messages to authenticated;
