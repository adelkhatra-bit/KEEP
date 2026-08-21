/**
 * KEEP DNA — "ADN musical" (innovation, derrière feature_flag `keep_dna`).
 *
 * CONFORMITÉ (voir docs/PLATFORM_COMPLIANCE.md §1) : calculé UNIQUEMENT à
 * partir des décisions propres à KEEP (GARDER/PASSER, corrections) — jamais
 * en analysant le catalogue ou les métadonnées brutes d'un provider. Cela
 * évite le point interdit par la politique Spotify ("building profiles of
 * users" / "derived listenership metrics" à partir de leur contenu) : ici,
 * le contenu analysé est le comportement de l'utilisateur DANS KEEP, qui
 * appartient à KEEP et à l'utilisateur, pas à Spotify.
 */
import { RoutingCorrection } from './types';

export interface DnaSourceDecision {
  artist: string;
  genres: string[];
  decision: 'KEPT' | 'PASSED';
  createdAt: string;
}

export interface MusicDNA {
  generatedAt: string;
  totalDecisions: number;
  topGenres: { genre: string; weight: number }[];
  topArtists: { artist: string; count: number }[];
  /** 0 (goûts très concentrés) à 1 (goûts très diversifiés) — entropie de Shannon normalisée. */
  diversityScore: number;
}

function shannonEntropyNormalized(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0 || counts.length <= 1) return 0;
  const probs = counts.filter((c) => c > 0).map((c) => c / total);
  const entropy = -probs.reduce((sum, p) => sum + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(counts.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

export function computeMusicDNA(decisions: DnaSourceDecision[]): MusicDNA {
  const kept = decisions.filter((d) => d.decision === 'KEPT');

  const genreCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  for (const d of kept) {
    artistCounts.set(d.artist, (artistCounts.get(d.artist) ?? 0) + 1);
    for (const genre of d.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  const totalGenreCount = Array.from(genreCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const topGenres = Array.from(genreCounts.entries())
    .map(([genre, count]) => ({ genre, weight: count / totalGenreCount }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  const topArtists = Array.from(artistCounts.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    totalDecisions: kept.length,
    topGenres,
    topArtists,
    diversityScore: shannonEntropyNormalized(Array.from(genreCounts.values())),
  };
}

/** Compatibilité musicale entre deux ADN — similarité cosinus sur les vecteurs de genres. */
export function compareMusicDNA(a: MusicDNA, b: MusicDNA): number {
  const genres = new Set([...a.topGenres.map((g) => g.genre), ...b.topGenres.map((g) => g.genre)]);
  if (genres.size === 0) return 0;

  const vecA = Array.from(genres).map((g) => a.topGenres.find((x) => x.genre === g)?.weight ?? 0);
  const vecB = Array.from(genres).map((g) => b.topGenres.find((x) => x.genre === g)?.weight ?? 0);

  const dot = vecA.reduce((sum, v, i) => sum + v * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(vecB.reduce((sum, v) => sum + v * v, 0));
  if (normA === 0 || normB === 0) return 0;

  return Math.max(0, Math.min(1, dot / (normA * normB)));
}

// Réutilise le même type que les corrections du router pour construire une
// décision DNA à partir d'un GARDER accepté (pas de duplication de modèle).
export function decisionFromAcceptedKeep(artist: string, genres: string[]): DnaSourceDecision {
  return { artist, genres, decision: 'KEPT', createdAt: new Date().toISOString() };
}

export function decisionFromCorrection(correction: RoutingCorrection): DnaSourceDecision {
  return { artist: correction.artist, genres: correction.genres, decision: 'KEPT', createdAt: correction.createdAt };
}
