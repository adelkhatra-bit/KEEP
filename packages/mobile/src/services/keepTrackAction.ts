/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 crédit. Seul un ajout réel
 * réussi dans une plateforme musicale externe consomme 1 crédit.
 * En essai gratuit local, l'ajout simulé consomme aussi le quota de test afin
 * que le compteur FREE se comporte exactement comme il se comportera une fois
 * un service musical connecté.
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import type { KeepVisibility } from '../types';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useUserStore } from '../store/useUserStore';
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
  const localTrialWrite = musicEngine.usesDemoMusicProvider && useUserStore.getState().isLocalGuest;
  const consumesCredit = externalWrite || localTrialWrite;
  const visibility: KeepVisibility = options?.visibility ?? 'PRIVATE';

  // En production : seul l'ajout externe consomme. En essai local : l'ajout
  // simulé consomme le quota de test, sinon l'utilisateur verrait toujours 3/3
  // et on ne pourrait jamais valider le parcours FREE avant mise en production.
  if (consumesCredit) await ensureDownloadCreditAvailable();

  const playlistsBefore = await withRetry(() => musicEngine.musicProvider.getPlaylists(session));
  const requestedId = chosenPlaylistId ?? recommendations[0]?.playlistId ?? null;
  const requestedRecommendation = recommendations.find((r) => r.playlistId === requestedId) ?? recommendations[0];
  let target = requestedId ? playlistsBefore.find((playlist) => playlist.id === requestedId) : undefined;

  // Une recommandation peut exister avant sa playlist physique. L'ancien code
  // ajoutait alors le morceau sous un id invisible et « Ranger ma musique »
  // pouvait afficher 0 morceau malgré un KEEP réel. On crée maintenant la
  // destination avant l'ajout : aucun faux compteur, aucune playlist fantôme.
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
    playlistName,
    downloaded,
    visibility,
    keepDecisionId,
    profileSyncFailed,
  };
}
