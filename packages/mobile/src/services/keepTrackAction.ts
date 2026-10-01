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
    /** false est réservé aux opérations système explicites. Un GARDER utilisateur coûte des FREE, quelle que soit sa provenance. */
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
  // On réutilise la décision existante : aucun crédit, aucun second ajout
  // fournisseur, aucune nouvelle ligne de profil.
  if (!userState.isDemoMode && !userState.isLocalGuest) {
    const existing = await checkOwnKeepLibrary(track).catch(() => null);
    if (existing?.exists && existing.match) {
      return {
        targetPlaylistId: existing.match.playlistId || 'keep-profile',
        playlistName: existing.match.playlistName || 'Mes Gardés',
        downloaded: false,
        visibility: existing.match.visibility ?? visibility,
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
  const alreadyThere = await withRetry(() => musicEngine.musicProvider.isTrackInPlaylist(session, targetPlaylistId, track));
  let downloaded = false;

  if (!alreadyThere) {
    await withRetry(() => musicEngine.musicProvider.addTrackToPlaylist(session, targetPlaylistId, track));
    downloaded = consumesCredit;
    // Audit Adel (11/09/2026) : le debit reel du credit se fait desormais dans
    // recordKeepDecision -> keep-music-core (verifie ET debite cote serveur,
    // via keep_consume_download_credit()) -- plus jamais ici cote client
    // seul, qui etait contournable directement (voir commentaire serveur).
    // ensureDownloadCreditAvailable() ci-dessus reste un pre-check local pour
    // eviter un aller-retour inutile ; il n'est plus la seule barriere.
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
    // Loki ne stocke jamais l'audio. Pour permettre la réécoute sur un profil
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

    // Pour tout compte réel, un GARDER n'est JAMAIS considéré comme réussi
    // tant que le serveur n'a pas confirmé la décision. Cela garantit que le
    // débit FREE et le ledger "dépensés aujourd'hui" sont bien passés avant
    // que Session/Loki Pulse n'affichent le morceau comme gardé.
    if (consumesCredit && (!recorded?.decisionId || !recorded?.trackId)) {
      throw new Error('KEEP_SERVER_NOT_CONFIRMED');
    }

    keepDecisionId = recorded?.decisionId;

    // L'Edge Function enregistre elle-même l'origine sociale uniquement lors
    // de la création du morceau gardé. Si le morceau existait déjà sur ce compte, son
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
  } catch (e: any) {
    // Compte réel : ne jamais masquer une panne serveur derrière un succès
    // local. Le morceau peut déjà avoir été ajouté au fournisseur ; au nouvel
    // essai, l'opération est idempotente et le serveur finalise décision + FREE.
    if (consumesCredit) throw e;
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
