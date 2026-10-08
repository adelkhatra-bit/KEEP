import type { CanonicalTrack } from '@keep/music';
import { Alert } from '../utils/keepAlert';
import { commitKeep } from './keepTrackAction';
import { markLokiPulseTrackKept } from './lokiPulseService';

/**
 * GARDER depuis Loki Pulse : une seule logique pour le profil ET l'accueil
 * (Adel 02/10/2026 : les bulles de l'accueil affichaient « déjà dans ta
 * collection » parce qu'elles ouvraient le Swipe en mode aperçu).
 * Débit FREE serveur, anti-doublon par MORCEAU, message précis en cas d'échec.
 */
export async function keepLokiPulseTrack(
  track: CanonicalTrack,
  visibility: 'PUBLIC' | 'PRIVATE',
  freeCostPerKeep: number,
  from?: { profileId: string; username?: string },
): Promise<{ ok: boolean; alreadyKept: boolean }> {
  try {
    // Adel (05/10/2026) : « je suis identifié dessus » -- un GARDER depuis la story de @x enregistre @x comme source (créateur identifié) ;
    // sans cela le morceau était gardé SANS aucun créateur (source_user_id vide en base : cas teyou).
    const result = await commitKeep(track, [], undefined, {
      visibility,
      // Depuis la story / le profil d'un autre membre : reprise GRATUITE (décision d'Adel 05/10/2026), créateur identifié.
      consumeCredit: !from?.profileId,
      socialFree: from?.profileId ? { sourceProfileId: from.profileId } : undefined,
      context: from?.profileId
        ? { source: 'story', recommendation: 'story_swipe', sourceProfileId: from.profileId, sourceUsername: from.username }
        : { source: 'loki_pulse', recommendation: 'personalized_profile_rail' },
    });
    await markLokiPulseTrackKept(track.id).catch(() => {});
    if (result.alreadyKept) {
      Alert.alert('Déjà dans tes musiques', 'Ce morceau était déjà sur ton profil. Aucun Free supplémentaire n’a été débité.');
    }
    return { ok: true, alreadyKept: result.alreadyKept };
  } catch (e: any) {
    Alert.alert('Loki Pulse', lokiPulseKeepErrorMessage(String(e?.message || ''), freeCostPerKeep));
    return { ok: false, alreadyKept: false };
  }
}

export function lokiPulseKeepErrorMessage(message: string, freeCostPerKeep: number): string {
  if (message.includes('CREDITS_EXHAUSTED')) return `Il te faut ${freeCostPerKeep} FREE pour garder ce morceau sur ton profil.`;
  if (message.includes('SELF_KEEP_NOT_ALLOWED')) return 'C’est déjà ton propre morceau.';
  if (message.includes('KEEP_SERVER_NOT_CONFIRMED')) return 'Le serveur n’a pas confirmé l’ajout (connexion lente). Réessaie dans un instant : un morceau déjà gardé n’est jamais débité deux fois.';
  return 'Impossible d’ajouter ce morceau pour le moment.';
}
