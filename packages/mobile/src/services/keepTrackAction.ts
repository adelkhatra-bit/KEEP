/**
 * Action GARDER partagée — chemin unique de téléchargement/rangement.
 * Règle produit : écouter/reconnaître/PASS = 0 FREE. Tout nouveau GARDER
 * manuel coûte le tarif serveur (3 FREE actuellement), quelle que soit
 * l'origine du morceau : Écouter, profil, Swipe ou Loki Pulse. Un doublon
 * déjà possédé reste idempotent et gratuit.
 */
import { CanonicalTrack, RoutingRecommendation } from '@keep/music';
import type { KeepVisibility } from '../types';
import { musicEngine } from './musicEngine';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useUserStore } from '../store/useUserStore';
import { withRetry } from './retry';
import { ensureDownloadCreditAvailable } from './creditService';
import { recordKeepDecision, updateKeepDecisionVisibility } from './keepMusicCoreRecognition';
import { syncPlaylistTrack } from './keepLibraryService';
import { checkOwnKeepLibrary } from './connectedMusicLibrary';

// Identifiant de la musique TELLE QUE GARDÉE par l'utilisateur (peut différer de l'id affiché : même titre via un autre fournisseur).
// La mise en story doit épingler cet identifiant-là, sinon le serveur ne trouve pas le GARDER public (Adel 05/10/2026, cas teyou).
const keptTrackIdByInputId = new Map<string, string>();
export function resolveKeptTrackId(inputTrackId: string): string {
  return keptTrackIdByInputId.get(inputTrackId) ?? inputTrackId;
}

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
    /** false est réservé aux opérations système explicites. Un GARDER utilisateur coûte des FREE, quelle que soit sa provenance. */
    consumeCredit?: boolean;
  }
): Promise<CommitKeepResult> {
  const userState = useUserStore.getState();
  const realAccount = !userState.isDemoMode && !userState.isLocalGuest;
  // Adel (02/10/2026) : « Loki Pulse : impossible d'ajouter ce morceau ».
  // Cause : GARDER exigeait une session Apple Music (getSession lève
  // « Apple Music non connecté ») AVANT la décision serveur. Or le GARDER
  // Loki (anti-doublon + débit FREE + profil) est entièrement serveur ;
  // Apple Music n'est qu'une copie optionnelle. Sans Apple Music, un compte
  // réel garde donc normalement, sans copie fournisseur.
  const session = realAccount
    ? await musicEngine.getSession().catch(() => null)
    : await musicEngine.getSession();
  const sourceProfileId = typeof options?.context?.sourceProfileId === 'string' ? options.context.sourceProfileId.trim() : '';
  if (sourceProfileId && sourceProfileId === userState.user?.id) {
    throw new Error('SELF_KEEP_NOT_ALLOWED');
  }
  const isSocialCopy = Boolean(sourceProfileId && sourceProfileId !== userState.user?.id);
  const visibility: KeepVisibility = options?.visibility ?? 'PRIVATE';

  // Barrière centrale : même si un écran oublie un jour son contrôle visuel,
  // GARDER un morceau déjà présent reste une action idempotente et gratuite.
  // On réutilise la décision existante : aucun crédit, aucun second ajout
  // fournisseur, aucune nouvelle ligne de profil.
  if (!userState.isDemoMode && !userState.isLocalGuest) {
    const existing = await checkOwnKeepLibrary(track).catch(() => null);
    if (existing?.exists && existing.match) {
      // Adel (05/10/2026) : « il l'a gardé en public pour sa story mais rien ne s'est passé » -- un morceau déjà gardé en PRIVÉ restait
      // privé même quand on choisissait Public (donc jamais en story). Le choix explicite Public rend la décision existante publique, sans débit.
      if (existing.match.trackId) keptTrackIdByInputId.set(track.id, existing.match.trackId);
      let alreadyVisibility = existing.match.visibility ?? visibility;
      if (options?.visibility === 'PUBLIC' && alreadyVisibility !== 'PUBLIC' && existing.match.decisionId) {
        const upgraded = await updateKeepDecisionVisibility(existing.match.decisionId, 'PUBLIC').catch(() => false);
        if (upgraded) alreadyVisibility = 'PUBLIC';
      }
      return {
        targetPlaylistId: existing.match.playlistId || 'keep-profile',
        playlistName: existing.match.playlistName || 'Mes Gardés',
        downloaded: false,
        visibility: alreadyVisibility,
        keepDecisionId: existing.match.decisionId,
        profileSyncFailed: false,
        alreadyKept: true,
      };
    }
  }

  // Chemin unique : tout NOUVEAU GARDER utilisateur coûte le même nombre
  // de FREE, y compris depuis le profil d'un autre membre. La provenance
  // sociale reste tracée séparément via source_user_id/source_type.
  const consumesCredit = !userState.isDemoMode && options?.consumeCredit !== false;

  if (consumesCredit) await ensureDownloadCreditAvailable();

  if (!session) {
    const playlistName = recommendations[0]?.playlistName?.trim() || 'Mes Gardés';
    const recorded = await recordKeepDecision(track, visibility, {
      ...(options?.context ?? {}),
      creditPolicy: consumesCredit ? 'LISTEN_KEEP' : 'SOCIAL_ZERO_CREDIT',
      playback: {
        previewUrl: track.previewUrl ?? null,
        availableOn: track.availableOn ?? [],
        externalUrls: track.externalUrls ?? {},
      },
      playlist: { provider: 'KEEP', providerPlaylistId: 'keep-profile', name: playlistName },
    });
    if (!recorded?.decisionId || !recorded?.trackId) throw new Error('KEEP_SERVER_NOT_CONFIRMED');
    keptTrackIdByInputId.set(track.id, String(recorded.trackId));
    await usePlaylistStore.getState().refresh().catch(() => {});
    return {
      targetPlaylistId: 'keep-profile',
      playlistName,
      downloaded: false,
      visibility,
      keepDecisionId: recorded.decisionId,
      profileSyncFailed: false,
      alreadyKept: false,
    };
  }

  const playlistsBefore = await withRetry(() => musicEngine.musicProvider.getPlaylists(session));
  const requestedId = chosenPlaylistId ?? recommendations[0]?.playlistId ?? null;
  const requestedRecommendation = recommendations.find((r) => r.playlistId === requestedId) ?? recommendations[0];
  let target = requestedId ? playlistsBefore.find((playlist) => playlist.id === requestedId) : undefined;

  if (!target && requestedId) {
    target = await withRetry(() => musicEngine.musicProvider.createPlaylist(
      session,
      requestedRecommendation?.playlistName?.trim() || 'Mes Gardés',
      'Morceaux rangés par Loki Music. Le nom et la visibilité peuvent être modifiés depuis Mes musiques.'
    ));
  }

  if (!target) target = playlistsBefore[0];

  if (!target) {
    target = await withRetry(() => musicEngine.musicProvider.createPlaylist(
      session,
      'Mes Gardés',
      'Morceaux gardés avec Loki Music.'
    ));
  }

  const targetPlaylistId = target.id;
  const playlistName = target.name;
  let keepDecisionId: string | undefined;
  let recordedTrackId: string | undefined;
  let profileSyncFailed = false;

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

  // Pour un compte réel, la décision serveur est la source de vérité.
  // Elle exécute désormais atomiquement : anti-doublon + débit FREE + KEEP.
  // Tant que cette transaction n'est pas confirmée, Session/Loki Pulse ne
  // doivent jamais considérer le morceau comme gardé.
  if (!userState.isDemoMode && !userState.isLocalGuest) {
    const recorded = await recordKeepDecision(track, visibility, decisionContext);
    if (!recorded?.decisionId || !recorded?.trackId) {
      throw new Error('KEEP_SERVER_NOT_CONFIRMED');
    }
    keepDecisionId = recorded.decisionId;
    recordedTrackId = recorded.trackId;
  }

  const alreadyThere = await withRetry(() => musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId, track));
  let downloaded = false;
  if (!alreadyThere) {
    try {
      await withRetry(() => musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId, track));
      downloaded = consumesCredit;
    } catch {
      // Le KEEP Loki + débit sont déjà confirmés côté serveur. Une panne du
      // fournisseur ne doit pas annuler l'acquisition dans Loki ; la synchro
      // fournisseur pourra être rejouée plus tard.
      profileSyncFailed = true;
    }
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

  if (recordedTrackId) {
    try {
      await syncPlaylistTrack({
        provider: session.provider || 'KEEP',
        providerPlaylistId: targetPlaylistId,
        playlistName,
        playlistDescription: target.description,
        coverUrl: target.coverUrl,
        trackId: recordedTrackId,
        addedVia: isSocialCopy ? 'SOCIAL' : 'KEEP',
      });
    } catch {
      profileSyncFailed = true;
    }
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
