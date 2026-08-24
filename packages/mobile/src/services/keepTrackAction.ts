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
import { useMusicServiceStore, MusicServiceId } from '../store/useMusicServiceStore';
import { withRetry } from './retry';

export interface CommitKeepResult {
  targetPlaylistId?: string;
  playlistName?: string;
  targetService?: MusicServiceId;
  /** 'waiting_sync' = gardé dans KEEP, aucun service connecté -- rien perdu, synchronisable plus tard (voir syncWaitingTracks ci-dessous). */
  syncState: 'synced' | 'waiting_sync';
}

/**
 * GARDER un morceau ne doit JAMAIS échouer simplement parce qu'aucun
 * service musical n'est connecté (cf. demande explicite du 22/08/2026 :
 * "il ne doit jamais être perdu"). Sans service connecté, on s'arrête ici
 * avec syncState='waiting_sync' -- aucun appel provider, donc aucune
 * tentative de connexion implicite.
 *
 * MULTI-SERVICE (cf. demande explicite du 23/08/2026 -- "Enregistrer
 * dans… Spotify / Apple Music / autre service connecté") : `chosenService`
 * précise la destination quand PLUSIEURS services sont connectés ; par
 * défaut le premier connecté (comportement mono-service inchangé quand un
 * seul l'est).
 */
export async function commitKeep(
  track: CanonicalTrack,
  recommendations: RoutingRecommendation[],
  chosenPlaylistId?: string,
  chosenService?: MusicServiceId
): Promise<CommitKeepResult> {
  const connected = useMusicServiceStore.getState().connectedServices;
  if (connected.length === 0) {
    return { syncState: 'waiting_sync' };
  }
  const service = chosenService ?? connected[0];

  const topRecommendation = recommendations[0]?.playlistId ?? null;
  const targetPlaylistId = chosenPlaylistId ?? topRecommendation;
  // BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "il m'a bloqué sur une
  // musique, il ne me donne pas la suite") : un service connecté mais sans
  // AUCUNE recommandation de playlist (SmartPlaylistRouter n'a pas encore
  // assez d'historique pour ce morceau/genre) faisait THROW ici -- l'appelant
  // (useSessionStore.keepTrack) capture l'erreur mais ne met JAMAIS le
  // morceau à jour vers 'kept', donc il reste bloqué en 'pending' en haut de
  // la liste indéfiniment, avec juste un message technique en petit texte
  // rouge. Même repli que "aucun service connecté" (ligne 43 ci-dessus) --
  // le morceau est réellement GARDÉ (jamais perdu), juste pas encore rangé
  // dans une playlist précise ; `syncWaitingTracks()` (déjà construit pour
  // ce cas) le retentera dès qu'une vraie recommandation existera.
  if (!targetPlaylistId) {
    return { syncState: 'waiting_sync' };
  }

  const provider = musicEngine.getProvider(service);
  const session = await musicEngine.getSessionFor(service);

  // Coupure réseau pendant l'écriture réelle chez le provider = retente,
  // ne perd jamais silencieusement un GARDER (cf. demande explicite du
  // 22/08/2026 "retry si Internet coupe").
  const alreadyThere = await withRetry(() => provider.isTrackInPlaylist(session, targetPlaylistId, track));
  if (!alreadyThere) {
    await withRetry(() => provider.addTrackToPlaylist(session, targetPlaylistId, track));
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
  return { targetPlaylistId, playlistName, targetService: service, syncState: 'synced' };
}
