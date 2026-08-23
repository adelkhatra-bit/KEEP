/**
 * ReleaseRequestEngine -- MODULE RÉUTILISABLE (cf. demande explicite du
 * 23/08/2026 : "quand plusieurs utilisateurs KEEP gardent un morceau absent
 * de Spotify/Apple Music/etc., comptabiliser la demande").
 * UTILISABLE DANS : fiche morceau (bouton "Demander sa sortie sur X"),
 * ArtistDemandDashboard, notifications créateur (voir ArtistClaim.ts).
 * STATUT : experimental -- interface + implémentation mémoire (demo/tests)
 * uniquement. AUCUNE table Supabase n'existe encore (`release_requests`
 * PLANNED, pas encore migré) -- une implémentation persistée reste à écrire
 * avant tout usage réel multi-utilisateurs (les compteurs ne doivent
 * JAMAIS repartir de zéro au redémarrage du serveur en production).
 *
 * ANTI-DOUBLON : un même utilisateur ne compte qu'UNE fois par
 * (morceau, plateforme), même s'il retape sur le bouton plusieurs fois --
 * `requestedByUserIds` est un Set, jamais un compteur brut incrémenté
 * aveuglément (cf. règle "sans doublons" déjà appliquée à
 * useRecentlyPlayedStore.ts).
 */
export interface ReleaseRequestSummary {
  trackId: string;
  platformId: string;
  requestCount: number;
  /** Horodatage de la 1ère et de la dernière demande -- base pour "évolution dans le temps" (ArtistDemandDashboard). */
  firstRequestedAt: string;
  lastRequestedAt: string;
}

export interface ReleaseRequestEngine {
  /** Idempotent -- une 2e demande du même utilisateur pour le même (track, platform) ne change rien. */
  requestRelease(trackId: string, platformId: string, userId: string): Promise<ReleaseRequestSummary>;
  getSummary(trackId: string, platformId: string): Promise<ReleaseRequestSummary | null>;
  /** Toutes les plateformes demandées pour UN morceau -- alimente la fiche morceau ("327 utilisateurs veulent ce morceau sur Spotify"). */
  getSummariesForTrack(trackId: string): Promise<ReleaseRequestSummary[]>;
  /** A-t-on demandé un morceau donné (userId, trackId, platformId) -- pour afficher le bouton déjà activé/grisé côté UI plutôt qu'un simple compteur muet. */
  hasRequested(trackId: string, platformId: string, userId: string): Promise<boolean>;
}

/** Implémentation en mémoire -- DEMO et tests uniquement, voir STATUT HONNÊTE ci-dessus. */
export class InMemoryReleaseRequestEngine implements ReleaseRequestEngine {
  private requests = new Map<string, { userIds: Set<string>; firstRequestedAt: string; lastRequestedAt: string }>();

  private key(trackId: string, platformId: string): string {
    return `${trackId}::${platformId}`;
  }

  async requestRelease(trackId: string, platformId: string, userId: string): Promise<ReleaseRequestSummary> {
    const key = this.key(trackId, platformId);
    const now = new Date().toISOString();
    const existing = this.requests.get(key);
    if (existing) {
      existing.userIds.add(userId);
      existing.lastRequestedAt = now;
    } else {
      this.requests.set(key, { userIds: new Set([userId]), firstRequestedAt: now, lastRequestedAt: now });
    }
    return (await this.getSummary(trackId, platformId))!;
  }

  async getSummary(trackId: string, platformId: string): Promise<ReleaseRequestSummary | null> {
    const entry = this.requests.get(this.key(trackId, platformId));
    if (!entry) return null;
    return {
      trackId,
      platformId,
      requestCount: entry.userIds.size,
      firstRequestedAt: entry.firstRequestedAt,
      lastRequestedAt: entry.lastRequestedAt,
    };
  }

  async getSummariesForTrack(trackId: string): Promise<ReleaseRequestSummary[]> {
    const results: ReleaseRequestSummary[] = [];
    for (const [key, entry] of this.requests) {
      const [entryTrackId, platformId] = key.split('::');
      if (entryTrackId !== trackId) continue;
      results.push({
        trackId,
        platformId,
        requestCount: entry.userIds.size,
        firstRequestedAt: entry.firstRequestedAt,
        lastRequestedAt: entry.lastRequestedAt,
      });
    }
    return results;
  }

  async hasRequested(trackId: string, platformId: string, userId: string): Promise<boolean> {
    return this.requests.get(this.key(trackId, platformId))?.userIds.has(userId) ?? false;
  }
}
