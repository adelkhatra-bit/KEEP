import { CanonicalTrack, ProviderTrackIds, RecognitionResult } from './types';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/\(feat\.?.*?\)/g, '')
    .replace(/\bfeat\.?.*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Distance de Levenshtein simple — suffisante pour du fuzzy matching titre/artiste courts. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length, 1);
  return 1 - dist / maxLen;
}

function discoveryLinks(title: string, artist: string): Record<string, string> {
  const query = encodeURIComponent(`${artist} ${title}`.trim());
  return {
    youtubeSearch: `https://www.youtube.com/results?search_query=${query}`,
    tiktokSearch: `https://www.tiktok.com/search?q=${query}`,
  };
}

export interface TrackIndexEntry extends CanonicalTrack {}

/**
 * TrackResolver — retrouve/fusionne un morceau canonique KEEP à travers les
 * providers (ex. un utilisateur Spotify partage avec un utilisateur Apple Music).
 *
 * Stratégie de résolution, dans l'ordre :
 *  1. Correspondance exacte ISRC (fiable à ~100% quand disponible).
 *  2. Correspondance exacte sur un providerId déjà connu.
 *  3. Similarité normalisée titre+artiste (fuzzy matching) au-dessus d'un seuil.
 * Si aucune correspondance suffisante n'est trouvée, un nouveau morceau
 * canonique est créé plutôt que de forcer un mauvais rapprochement.
 */
export class TrackResolver {
  private byIsrc = new Map<string, CanonicalTrack>();
  private byProviderId = new Map<string, CanonicalTrack>(); // key: `${provider}:${id}`
  private all: CanonicalTrack[] = [];

  constructor(seed: CanonicalTrack[] = []) {
    for (const t of seed) this.index(t);
  }

  private index(track: CanonicalTrack) {
    this.all.push(track);
    if (track.isrc) this.byIsrc.set(track.isrc, track);
    for (const [provider, id] of Object.entries(track.providerIds)) {
      if (id) this.byProviderId.set(`${provider}:${id}`, track);
    }
  }

  /** Résout une correspondance existante sans en créer une nouvelle. Utilisé par le Compare. */
  findExisting(query: { isrc?: string; provider?: string; providerId?: string; title?: string; artist?: string }): CanonicalTrack | null {
    if (query.isrc && this.byIsrc.has(query.isrc)) return this.byIsrc.get(query.isrc)!;
    if (query.provider && query.providerId) {
      const hit = this.byProviderId.get(`${query.provider}:${query.providerId}`);
      if (hit) return hit;
    }
    if (query.title && query.artist) {
      const FUZZY_THRESHOLD = 0.85;
      let best: { track: CanonicalTrack; score: number } | null = null;
      for (const t of this.all) {
        const titleSim = similarity(t.title, query.title);
        const artistSim = similarity(t.artist, query.artist);
        const score = titleSim * 0.6 + artistSim * 0.4;
        if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
          best = { track: t, score };
        }
      }
      if (best) return best.track;
    }
    return null;
  }

  /** Résout à partir d'un résultat de reconnaissance, en créant un morceau canonique si besoin. */
  resolveFromRecognition(result: RecognitionResult, idFactory: () => string = () => cryptoRandomId()): CanonicalTrack {
    const links = { ...discoveryLinks(result.title, result.artist), ...(result.externalUrls ?? {}) };
    const existing = this.findExisting({ isrc: result.isrc, title: result.title, artist: result.artist });
    if (existing) {
      // Enrichir un morceau déjà connu sans perdre son identité canonique.
      if (!existing.artworkUrl && result.artworkUrl) existing.artworkUrl = result.artworkUrl;
      if (!existing.album && result.album) existing.album = result.album;
      if (!existing.previewUrl && result.previewUrl) existing.previewUrl = result.previewUrl;
      if (result.availableOn?.length) existing.availableOn = Array.from(new Set([...(existing.availableOn ?? []), ...result.availableOn]));
      existing.externalUrls = { ...(existing.externalUrls ?? {}), ...links };
      if (result.genres?.length) existing.genres = Array.from(new Set([...(existing.genres ?? []), ...result.genres]));
      for (const [provider, id] of Object.entries(result.providerIds ?? {})) {
        if (id) this.linkProviderId(existing, provider, id);
      }
      return existing;
    }

    const track: CanonicalTrack = {
      id: idFactory(),
      isrc: result.isrc,
      title: result.title,
      artist: result.artist,
      album: result.album,
      artworkUrl: result.artworkUrl,
      previewUrl: result.previewUrl,
      availableOn: result.availableOn,
      externalUrls: links,
      genres: result.genres ?? [],
      providerIds: { ...(result.providerIds ?? {}) },
    };
    this.index(track);
    return track;
  }

  /** Fusionne un ID provider supplémentaire sur un morceau déjà connu (ex. après un match Compare). */
  linkProviderId(track: CanonicalTrack, provider: keyof ProviderTrackIds, providerId: string): CanonicalTrack {
    track.providerIds[provider] = providerId;
    this.byProviderId.set(`${String(provider)}:${providerId}`, track);
    return track;
  }

  size(): number {
    return this.all.length;
  }
}

function cryptoRandomId(): string {
  // Environnement RN/Node — fallback simple, remplacé par uuid v4 en production.
  return 'trk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export { similarity as trackSimilarityForTesting };
