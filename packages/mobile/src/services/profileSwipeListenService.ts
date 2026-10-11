import { supabase } from './supabaseClient';
import { useUserStore } from '../store/useUserStore';

/**
 * Enregistre une vraie écoute lancée depuis le Swipe d'un profil visité.
 * Aucun appel n'est envoyé pour un invité, le mode démo, une auto-écoute,
 * ni quand Supabase n'est pas disponible. Le serveur applique ensuite ses
 * propres contrôles : morceau PUBLIC, hors collection masquée, déduplication.
 */
export async function recordProfileSwipeListen(sourceProfileId: string, trackId: string): Promise<boolean> {
  const account = useUserStore.getState();
  const listenerId = account.user?.id;

  if (
    !supabase
    || !listenerId
    || account.isLocalGuest
    || account.isDemoMode
    || !sourceProfileId
    || !trackId
    || listenerId === sourceProfileId
  ) {
    return false;
  }

  const { data, error } = await supabase.rpc('keep_profile_swipe_listen_record', {
    p_source_profile_id: sourceProfileId,
    p_track_id: trackId,
  });

  if (error) return false;
  return Boolean(data);
}
