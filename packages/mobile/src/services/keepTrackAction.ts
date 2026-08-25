/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 crédit. Seul un ajout réel
 * réussi dans une plateforme musicale consomme 1 crédit.
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { withRetry } from './retry';
import { consumeDownloadCredit, ensureDownloadCreditAvailable } from './creditService';

export interface CommitKeepResult {
  targetPlaylistId: string;
  playlistName: string;
  downloaded: boolean;
}

export async function commitKeep(
  track: CanonicalTrack,
  recommendations: RoutingRecommendation[],
  chosenPlaylistId?: string
): Promise<CommitKeepResult> {
  const session = await musicEngine.getSession();

  // Vérifie le quota AVANT toute écriture externe. Aucun crédit n'est encore
  // consommé à ce stade.
  await ensureDownloadCreditAvailable();

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
    downloaded = true;
    // Consommation seulement APRÈS ajout externe réussi.
    await consumeDownloadCredit();
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

  await usePlaylistStore.getState().refresh();

  return { targetPlaylistId, playlistName: playlistName || 'KEEP', downloaded };
}
