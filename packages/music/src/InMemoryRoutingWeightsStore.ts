import { RoutingWeightsStore } from './types';

/**
 * Implémentation en mémoire de RoutingWeightsStore — pour DEMO et tests.
 * En production, remplacée par une implémentation Supabase persistant
 * dans la table `routing_weights` (voir supabase/migrations).
 */
export class InMemoryRoutingWeightsStore implements RoutingWeightsStore {
  private artistWeights = new Map<string, Record<string, Record<string, number>>>();
  private genreWeights = new Map<string, Record<string, Record<string, number>>>();

  async getArtistWeights(userId: string) {
    return this.artistWeights.get(userId) ?? {};
  }

  async incrementArtistWeight(userId: string, artist: string, playlistId: string, amount: number) {
    const userMap = this.artistWeights.get(userId) ?? {};
    const artistMap = userMap[artist] ?? {};
    artistMap[playlistId] = (artistMap[playlistId] ?? 0) + amount;
    userMap[artist] = artistMap;
    this.artistWeights.set(userId, userMap);
  }

  async getGenreWeights(userId: string) {
    return this.genreWeights.get(userId) ?? {};
  }

  async incrementGenreWeight(userId: string, genre: string, playlistId: string, amount: number) {
    const userMap = this.genreWeights.get(userId) ?? {};
    const genreMap = userMap[genre] ?? {};
    genreMap[playlistId] = (genreMap[playlistId] ?? 0) + amount;
    userMap[genre] = genreMap;
    this.genreWeights.set(userId, userMap);
  }
}
