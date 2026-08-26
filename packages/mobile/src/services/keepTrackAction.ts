/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 crédit. Seul un ajout réel
 * réussi dans une plateforme musicale externe consomme 1 crédit.
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import type { KeepVisibility } from '../types';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { withRetry } from './retry';
import { consumeDownloadCredit, ensureDownloadCreditAvailable } from './creditService';
import { recordKeepDecision } from './keepMusicCoreRecognition';

export interface CommitKeepResult {
  targetPlaylistId: string;
  playlistName: string;
  downloaded: boolean;
  visibility: KeepVisibility;
  keepDecisionId?: string;
  profileSyncFailed: boolean;
}

export async function commitKeep(
  track: CanonicalTrack,
  recommendations: RoutingRecommendation[],
  chosenPlaylistId?: string,
  options?: { visibility?: KeepVisibility; context?: Record<string, unknown> }
): Promise<CommitKeepResult> {
  const session = await musicEngine.getSession();
  const externalWrite = !musicEngine.usesDemoMusicProvider;
  const visibility: KeepVisibility = options?.visibility ?? 'PRIVATE';

  // L'essai/public peut ranger localement un morceau reconnu sans consommer
  // un crédit. Le quota n'est vérifié que lorsqu'un vrai service musical
  // externe va effectivement recevoir le morceau.
  if (externalWrite) await ensureDownloadCreditAvailable();

  let targetPlaylistId = chosenPlaylistId ?? recommendations[0]?.playlistId ?? null;
  let playlistName = recommendations.find((r) => r.playlistId === targetPlaylistId)?.playlistName ?? '';

  if (!targetPlaylistId) {
    const playlists = await withRetry(() => musicEngine.musicProvider.getPlaylists(session));
    const first = playlists[0];
    if (first) {
      targetPlaylistId = first.id;
      playlistName = first.name;
    } else {
      const created = await withRetry(() => musicEngine.musicProvider.createPlaylist(
        session,
        'KEEP',
        'Morceaux gardés automatiquement par KEEP.'
      ));
      targetPlaylistId = created.id;
      playlistName = created.name;
    }
  }

  const alreadyThere = await withRetry(() => musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId!, track));
  let downloaded = false;

  if (!alreadyThere) {
    await withRetry(() => musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId!, track));
    downloaded = externalWrite;
    if (externalWrite) await consumeDownloadCredit();
  }

  const topRecommendation = recommendations[0]?.playlistId ?? null;
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

  let keepDecisionId: string | undefined;
  let profileSyncFailed = false;
  try {
    const recorded = await recordKeepDecision(track, visibility, options?.context ?? {});
    keepDecisionId = recorded?.decisionId;
  } catch {
    // Le morceau est déjà gardé dans la bibliothèque. On ne transforme jamais
    // une panne de synchro profil en faux échec de téléchargement.
    profileSyncFailed = true;
  }

  await usePlaylistStore.getState().refresh();

  return {
    targetPlaylistId,
    playlistName: playlistName || 'KEEP',
    downloaded,
    visibility,
    keepDecisionId,
    profileSyncFailed,
  };
}
