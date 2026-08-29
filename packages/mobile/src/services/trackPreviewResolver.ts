import type { CanonicalTrack } from '@keep/music';

type CacheEntry = { url: string | null; expiresAt: number };
const previewCache = new Map<string, CacheEntry>();
const POSITIVE_CACHE_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 60 * 1000;
const STOREFRONTS = ['FR', 'US', 'GB', 'CA'];

function normalize(value: string | undefined | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreResult(track: CanonicalTrack, result: any): number {
  const wantedTitle = normalize(track.title);
  const wantedArtist = normalize(track.artist);
  const resultTitle = normalize(result?.trackName);
  const resultArtist = normalize(result?.artistName);

  let score = 0;
  if (wantedTitle && resultTitle === wantedTitle) score += 8;
  else if (wantedTitle && resultTitle && (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle))) score += 4;

  if (wantedArtist && resultArtist === wantedArtist) score += 6;
  else if (wantedArtist && resultArtist && (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist))) score += 3;

  if (result?.previewUrl) score += 2;
  return score;
}

async function searchStorefront(track: CanonicalTrack, country: string): Promise<string | null> {
  const term = encodeURIComponent(`${track.artist} ${track.title}`.trim());
  const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=12&country=${country}`);
  if (!response.ok) return null;

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const best = results
    .filter((item: any) => typeof item?.previewUrl === 'string' && item.previewUrl.length > 0)
    .map((item: any) => ({ item, score: scoreResult(track, item) }))
    .sort((a: any, b: any) => b.score - a.score)[0];

  return best?.score >= 7 ? String(best.item.previewUrl) : null;
}

/**
 * Résout un extrait promotionnel public sans stocker de fichier audio.
 * Les URLs Apple peuvent changer ou devenir indisponibles selon le storefront :
 * un échec n'est donc jamais mis en cache durablement et un refresh forcé peut
 * remplacer silencieusement une URL Supabase devenue obsolète.
 */
export async function resolveTrackPreviewUrl(
  track: CanonicalTrack,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const existing = track.previewUrl?.trim();
  if (existing && !options.forceRefresh) return existing;

  const cacheKey = `${normalize(track.artist)}::${normalize(track.title)}`;
  const cached = previewCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.url;
  if (options.forceRefresh) previewCache.delete(cacheKey);

  let preview: string | null = null;
  for (const country of STOREFRONTS) {
    try {
      preview = await searchStorefront(track, country);
      if (preview) break;
    } catch {
      // On continue avec le storefront suivant : une panne locale ne doit pas
      // rendre l'extrait définitivement indisponible.
    }
  }

  previewCache.set(cacheKey, {
    url: preview,
    expiresAt: Date.now() + (preview ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS),
  });
  return preview;
}

export function invalidateTrackPreviewCache(track: Pick<CanonicalTrack, 'title' | 'artist'>): void {
  previewCache.delete(`${normalize(track.artist)}::${normalize(track.title)}`);
}
