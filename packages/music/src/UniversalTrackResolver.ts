import { TrackResolver } from './TrackResolver';
import { MusicProviderAdapter } from './providers/MusicProviderAdapter';
import { CanonicalTrack, ProviderSession, RecognitionResult } from './types';

/** Une plateforme réellement interrogée pour savoir si elle a ce morceau -- adapter + session déjà authentifiée. */
export interface ConnectedProvider {
  adapter: MusicProviderAdapter;
  session: ProviderSession;
}

export type AvailabilityStatus = 'found' | 'not_found' | 'unknown';

export interface AvailabilityEntry {
  providerId: string;
  status: AvailabilityStatus;
  /** ID du morceau chez ce provider, seulement si status === 'found'. */
  providerTrackId?: string;
}

export interface ResolvedAvailability {
  track: CanonicalTrack;
  /** Une entrée par plateforme CONNECTÉE (session authentifiée) -- jamais une entrée inventée pour une plateforme qu'on n'a pas réellement interrogée. */
  perProvider: AvailabilityEntry[];
}

/**
 * UniversalTrackResolver -- moteur central demandé le 23/08/2026 :
 *
 *   Micro ou URL -> TrackIdentity -> UniversalTrackResolver
 *   -> Spotify / Apple Music / YouTube / YouTube Music / autres
 *   -> KEEP / Sync / Playlist
 *
 * Étend TrackResolver (identité + dédoublonnage ISRC/titre-artiste-durée,
 * inchangé) avec l'étape qui manquait : une fois un morceau identifié,
 * interroger RÉELLEMENT chaque plateforme CONNECTÉE (searchTrack) pour savoir
 * où il existe, et fusionner les IDs trouvés sur le même CanonicalTrack.
 *
 * LIMITE HONNÊTE ASSUMÉE : on ne peut interroger que les plateformes pour
 * lesquelles KEEP a une session utilisateur authentifiée (searchTrack exige
 * un ProviderSession réel -- recherche au nom de l'utilisateur, pas une
 * recherche publique anonyme). Pour toute plateforme non connectée, le statut
 * est "unknown" -- jamais "not_found" (on ne l'a simplement pas demandé) et
 * jamais un lien deviné. `CanonicalTrack.songLink` (AudD song_link) reste la
 * seule vraie réponse "où l'écouter" tant que l'utilisateur n'a connecté
 * aucune plateforme.
 */
export class UniversalTrackResolver {
  constructor(private readonly trackResolver: TrackResolver) {}

  /** Étape 1 -- identité normalisée + dédoublonnage (délègue à TrackResolver, déjà réel). */
  identify(recognition: RecognitionResult): CanonicalTrack {
    return this.trackResolver.resolveFromRecognition(recognition);
  }

  /**
   * Étape 2 -- disponibilité réelle sur chaque plateforme connectée.
   * `Promise.allSettled` : l'échec d'une plateforme (jeton expiré, panne API)
   * ne doit jamais empêcher les autres de répondre, et ne doit jamais se
   * traduire par un faux "not_found" -- juste "unknown" pour celle-là.
   */
  async resolveAvailability(track: CanonicalTrack, connected: ConnectedProvider[]): Promise<ResolvedAvailability> {
    const settled = await Promise.allSettled(
      connected.map(async ({ adapter, session }): Promise<AvailabilityEntry> => {
        const existingId = track.providerIds[adapter.providerId];
        if (existingId) return { providerId: adapter.providerId, status: 'found', providerTrackId: existingId };

        const match = await adapter.searchTrack(session, {
          title: track.title,
          artist: track.artist,
          isrc: track.isrc,
        });
        if (!match) return { providerId: adapter.providerId, status: 'not_found' };

        const providerTrackId = match.providerIds[adapter.providerId];
        if (providerTrackId) this.trackResolver.linkProviderId(track, adapter.providerId, providerTrackId);
        return { providerId: adapter.providerId, status: 'found', providerTrackId };
      })
    );

    const perProvider: AvailabilityEntry[] = settled.map((result, i) =>
      result.status === 'fulfilled' ? result.value : { providerId: connected[i].adapter.providerId, status: 'unknown' }
    );

    return { track, perProvider };
  }
}
