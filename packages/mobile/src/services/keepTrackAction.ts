/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 crédit. Seul GARDER consomme
 * un crédit gratuit. Quand les crédits sont épuisés, les stores conservent le
 * morceau en attente dans Mes Sessions au lieu de bloquer l'écoute.
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import type { KeepVisibility } from '../types';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useUserStore } from '../store/useUserStore';
import { withRetry } from './retry';
import { consumeDownloadCredit, ensureDownloadCreditAvailable } from './creditService';
import { recordKeepDecision } from './keepMusicCoreRecognition';
import { syncPlaylistTrack } from './keepLibraryService';

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
  const userState = useUserStore.getState();
  // Mode démo développeur = illimité pour les tests visuels. Tous les autres
  // usages réels (invité local ou compte KEEP) suivent le compteur de crédits,
  // même si la bibliothèque musicale de test est locale. Ainsi le tunnel
  // 3 crédits invité + 4 après inscription est testable sans fournisseur payant.
  const consumesCredit = !userState.isDemoMode;
  const visibility: KeepVisibility = options?.visibility ?? 'PRIVATE';

  if (consumesCredit) await ensureDownloadCreditAvailable();

  const playlistsBefore = await withRetry(() => musicEngine.musicProvider.getPlaylists(session));
  const requestedId = chosenPlaylistId ?? recommendations[0]?.playlistId ?? null;
  const requestedRecommendation = recommendations.find((r) => r.playlistId === requestedId) ?? recommendations[0];
  let target = requestedId ? playlistsBefore.find((playlist) => playlist.id === requestedId) : undefined;

  if (!target && requestedId) {
    target = await withRetry(() => musicEngine.musicProvider.createPlaylist(
      session,
      requestedRecommendation?.playlistName?.trim() || 'Mes KEEP',
      'Morceaux rangés par KEEP. Le nom et la visibilité peuvent être modifiés depuis Mes musiques.'
    ));
  }

  if (!target) target = playlistsBefore[0];

  if (!target) {
    target = await withRetry(() => musicEngine.musicProvider.createPlaylist(
      session,
      'Mes KEEP',
      'Morceaux gardés avec KEEP.'
    ));
  }

  const targetPlaylistId = target.id;
  const playlistName = target.name;
  const alreadyThere = await withRetry(() => musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId, track));
  let downloaded = false;

  if (!alreadyThere) {
    await withRetry(() => musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId, track));
    downloaded = consumesCredit;
    if (consumesCredit) await consumeDownloadCredit();
  }

  const topRecommendation = recommendations[0]?.playlistId ?? null;
  if (requestedId && requestedId === topRecommendation) {
    await musicEngine.router.recordAccepted(session.userId, track, targetPlaylistId);
  } else if (requestedId) {
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
    // KEEP ne stocke jamais l'audio. Pour permettre la réécoute sur un profil
    // public, on conserve uniquement les petits liens catalogue déjà renvoyés
    // par la reconnaissance (extrait promotionnel + deep links fournisseurs).
    const decisionContext = {
      ...(options?.context ?? {}),
      playback: {
        previewUrl: track.previewUrl ?? null,
        availableOn: track.availableOn ?? [],
        externalUrls: track.externalUrls ?? {},
      },
      playlist: {
        provider: session.provider || 'KEEP',
        providerPlaylistId: targetPlaylistId,
        name: playlistName,
      },
    };
    const recorded = await recordKeepDecision(track, visibility, decisionContext);
    keepDecisionId = recorded?.decisionId;
    if (recorded?.trackId) {
      await syncPlaylistTrack({
        provider: session.provider || 'KEEP',
        providerPlaylistId: targetPlaylistId,
        playlistName,
        playlistDescription: target.description,
        coverUrl: target.coverUrl,
        trackId: recorded.trackId,
      });
    }
  } catch {
    profileSyncFailed = true;
  }

  await usePlaylistStore.getState().refresh();

  return {
    targetPlaylistId,
    playlistName,
    downloaded,
    visibility,
    keepDecisionId,
    profileSyncFailed,
  };
}
