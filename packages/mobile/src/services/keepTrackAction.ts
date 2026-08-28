/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 crédit. Un GARDER issu d'une
 * écoute consomme un crédit gratuit ; reprendre un morceau depuis le profil
 * d'un autre membre est une découverte sociale et reste à 0 crédit.
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
import { checkOwnKeepLibrary } from './connectedMusicLibrary';

export interface CommitKeepResult {
  targetPlaylistId: string;
  playlistName: string;
  downloaded: boolean;
  visibility: KeepVisibility;
  keepDecisionId?: string;
  profileSyncFailed: boolean;
  alreadyKept: boolean;
}

export async function commitKeep(
  track: CanonicalTrack,
  recommendations: RoutingRecommendation[],
  chosenPlaylistId?: string,
  options?: {
    visibility?: KeepVisibility;
    context?: Record<string, unknown>;
    /** false = découverte sociale : le morceau est gardé sans toucher au quota d'écoute. */
    consumeCredit?: boolean;
  }
): Promise<CommitKeepResult> {
  const session = await musicEngine.getSession();
  const userState = useUserStore.getState();
  const sourceProfileId = typeof options?.context?.sourceProfileId === 'string' ? options.context.sourceProfileId.trim() : '';
  if (sourceProfileId && sourceProfileId === userState.user?.id) {
    throw new Error('SELF_KEEP_NOT_ALLOWED');
  }
  const isSocialCopy = Boolean(sourceProfileId && sourceProfileId !== userState.user?.id);
  const visibility: KeepVisibility = options?.visibility ?? 'PRIVATE';

  // Barrière centrale : même si un écran oublie un jour son contrôle visuel,
  // GARDER un morceau déjà présent reste une action idempotente et gratuite.
  // On réutilise la décision KEEP existante : aucun crédit, aucun second ajout
  // fournisseur, aucune nouvelle ligne de profil.
  if (!userState.isDemoMode && !userState.isLocalGuest) {
    const existing = await checkOwnKeepLibrary(track).catch(() => null);
    if (existing?.exists && existing.match) {
      return {
        targetPlaylistId: existing.match.playlistId || 'keep-profile',
        playlistName: existing.match.playlistName || 'Mes KEEP',
        downloaded: false,
        visibility: existing.match.visibility ?? visibility,
        keepDecisionId: existing.match.decisionId,
        profileSyncFailed: false,
        alreadyKept: true,
      };
    }
  }

  // Une reprise depuis le profil d'un autre membre est un cadeau communautaire :
  // elle est tracée mais ne touche jamais au quota FREE de reconnaissance/KEEP.
  const consumesCredit = !userState.isDemoMode && !isSocialCopy && options?.consumeCredit !== false;

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
      creditPolicy: consumesCredit ? 'LISTEN_KEEP' : 'SOCIAL_ZERO_CREDIT',
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

    // L'Edge Function enregistre elle-même l'origine sociale uniquement lors
    // de la création du KEEP. Si le morceau existait déjà sur ce compte, son
    // origine historique doit rester intacte : on ne la réécrit jamais ici.
    if (recorded?.trackId) {
      await syncPlaylistTrack({
        provider: session.provider || 'KEEP',
        providerPlaylistId: targetPlaylistId,
        playlistName,
        playlistDescription: target.description,
        coverUrl: target.coverUrl,
        trackId: recorded.trackId,
        addedVia: isSocialCopy ? 'SOCIAL' : 'KEEP',
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
    alreadyKept: false,
  };
}
