/**
 * Action GARDER partagée (cahier des charges §14) — utilisée à la fois
 * pendant une session active (garder "au fil de l'eau") et depuis le
 * récapitulatif de session (garder après coup). Une seule implémentation
 * du chemin réel reconnaissance -> recommandation -> ajout provider ->
 * apprentissage, pour ne jamais diverger entre les deux écrans (cf. règle
 * anti-doublon).
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';

export interface CommitKeepResult {
  targetPlaylistId: string;
  playlistName: string;
}

export async function commitKeep(
  track: CanonicalTrack,
  recommendations: RoutingRecommendation[],
  chosenPlaylistId?: string
): Promise<CommitKeepResult> {
  const topRecommendation = recommendations[0]?.playlistId ?? null;
  const targetPlaylistId = chosenPlaylistId ?? topRecommendation;
  if (!targetPlaylistId) {
    throw new Error('Aucune playlist disponible pour ranger ce morceau.');
  }

  const session = await musicEngine.getSession();

  const alreadyThere = await musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId, track);
  if (!alreadyThere) {
    await musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId, track);
  }

  if (targetPlaylistId === topRecommendation) {
    await musicEngine.router.recordAccepted(session.userId, track, targetPlaylistId);
  } else {
    await musicEngine.router.recordCorrection(session.userId, {
      trackId: track.id,
      artist: track.artist,
      genres: track.genres ?? [],
      recommendedPlaylistId: topRecommendation,
      chosenPlaylistId: targetPlaylistId,
      createdAt: new Date().toISOString(),
    });
  }

  // MesMusiques doit refléter l'ajout réel dès qu'il a lieu, session live ou récap.
  await usePlaylistStore.getState().refresh();

  const playlistName = recommendations.find((r) => r.playlistId === targetPlaylistId)?.playlistName ?? 'ta playlist';
  return { targetPlaylistId, playlistName };
}
