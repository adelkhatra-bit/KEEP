import { CanonicalTrack, ProviderPlaylist, RoutingContext, RoutingCorrection, RoutingRecommendation, RoutingWeightsStore } from './types';

/**
 * Pondérations globales, administrables depuis le Super Admin (section 95
 * du cahier des charges). Un changement ici doit être versionné — voir
 * table `router_config_versions` dans supabase/migrations.
 */
export interface SmartRouterWeightsConfig {
  nameKeywordMatch: number; // poids: mot-clé du nom de playlist retrouvé dans titre/artiste/genre
  descriptionKeywordMatch: number;
  learnedArtistWeight: number; // poids: cet utilisateur a déjà rangé cet artiste ici
  learnedGenreWeight: number;
  correctionBoost: number; // amplitude d'apprentissage à chaque correction utilisateur
  acceptBoost: number; // amplitude d'apprentissage quand une recommandation est acceptée telle quelle
}

export const DEFAULT_ROUTER_WEIGHTS: SmartRouterWeightsConfig = {
  nameKeywordMatch: 0.35,
  descriptionKeywordMatch: 0.15,
  learnedArtistWeight: 0.35,
  learnedGenreWeight: 0.15,
  correctionBoost: 3,
  acceptBoost: 1,
};

function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * SmartPlaylistRouter — apprend comment CHAQUE utilisateur range sa musique.
 * Deux utilisateurs peuvent ranger le même morceau différemment : c'est voulu
 * (cf. cahier des charges §16), donc tout l'état d'apprentissage est
 * scopé par userId via le RoutingWeightsStore injecté.
 *
 * Algorithme MVP transparent (pas de boîte noire) :
 *  - correspondance de mots-clés entre nom/description de playlist et
 *    titre/artiste/genres du morceau ;
 *  - poids appris par artiste et par genre, mis à jour à chaque décision
 *    utilisateur (GARDER accepté = petit renfort, correction = fort renfort).
 * Cet algorithme est volontairement simple et explicable pour le MVP ;
 * il pourra être enrichi (embeddings, contexte temporel plus riche) une
 * fois assez de données réelles collectées — mais restera toujours
 * personnalisé par utilisateur.
 */
export class SmartPlaylistRouter {
  constructor(
    private readonly weightsStore: RoutingWeightsStore,
    private readonly config: SmartRouterWeightsConfig = DEFAULT_ROUTER_WEIGHTS
  ) {}

  async recommend(
    userId: string,
    track: CanonicalTrack,
    playlists: ProviderPlaylist[],
    _context?: RoutingContext
  ): Promise<RoutingRecommendation[]> {
    const [artistWeights, genreWeights] = await Promise.all([
      this.weightsStore.getArtistWeights(userId),
      this.weightsStore.getGenreWeights(userId),
    ]);

    const trackTokens = new Set([...tokenize(track.title), ...tokenize(track.artist), ...(track.genres ?? []).flatMap(tokenize)]);
    const artistMap = artistWeights[track.artist] ?? {};
    const genreTotals: Record<string, number> = {};
    for (const genre of track.genres ?? []) {
      const map = genreWeights[genre] ?? {};
      for (const [playlistId, w] of Object.entries(map)) {
        genreTotals[playlistId] = (genreTotals[playlistId] ?? 0) + w;
      }
    }

    const maxArtistWeight = Math.max(1, ...Object.values(artistMap));
    const maxGenreWeight = Math.max(1, ...Object.values(genreTotals));

    const recommendations: RoutingRecommendation[] = playlists.map((playlist) => {
      const nameTokens = new Set(tokenize(playlist.name));
      const descTokens = new Set(tokenize(playlist.description));

      const nameOverlap = intersectionSize(trackTokens, nameTokens) / Math.max(1, nameTokens.size);
      const descOverlap = intersectionSize(trackTokens, descTokens) / Math.max(1, descTokens.size);

      const learnedArtist = (artistMap[playlist.id] ?? 0) / maxArtistWeight;
      const learnedGenre = (genreTotals[playlist.id] ?? 0) / maxGenreWeight;

      const rawScore =
        nameOverlap * this.config.nameKeywordMatch +
        descOverlap * this.config.descriptionKeywordMatch +
        learnedArtist * this.config.learnedArtistWeight +
        learnedGenre * this.config.learnedGenreWeight;

      const reasons: string[] = [];
      if (nameOverlap > 0) reasons.push('mots-clés du nom de playlist');
      if (learnedArtist > 0.3) reasons.push(`tu ranges souvent ${track.artist} ici`);
      if (learnedGenre > 0.3 && track.genres?.length) reasons.push(`style proche de ${track.genres[0]}`);

      return {
        playlistId: playlist.id,
        playlistName: playlist.name,
        score: Math.max(0, Math.min(1, rawScore)),
        reason: reasons.length ? reasons.join(', ') : 'nouvelle playlist, pas encore d’historique',
      };
    });

    return recommendations.sort((a, b) => b.score - a.score);
  }

  /** Appelé quand l'utilisateur accepte la recommandation telle quelle (GARDER direct). */
  async recordAccepted(userId: string, track: CanonicalTrack, playlistId: string): Promise<void> {
    await this.weightsStore.incrementArtistWeight(userId, track.artist, playlistId, this.config.acceptBoost);
    for (const genre of track.genres ?? []) {
      await this.weightsStore.incrementGenreWeight(userId, genre, playlistId, this.config.acceptBoost);
    }
  }

  /** Appelé quand l'utilisateur corrige la recommandation (KEEP proposait X, il choisit Y) — apprentissage fort. */
  async recordCorrection(userId: string, correction: RoutingCorrection): Promise<void> {
    await this.weightsStore.incrementArtistWeight(userId, correction.artist, correction.chosenPlaylistId, this.config.correctionBoost);
    for (const genre of correction.genres) {
      await this.weightsStore.incrementGenreWeight(userId, genre, correction.chosenPlaylistId, this.config.correctionBoost);
    }
  }
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
}
