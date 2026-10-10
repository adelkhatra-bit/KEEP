import type { CanonicalTrack } from '@keep/music';

type CacheEntry = { url: string | null; expiresAt: number };
const previewCache = new Map<string, CacheEntry>();
const POSITIVE_CACHE_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 60 * 1000;
const STOREFRONTS = ['FR', 'US', 'GB', 'CA'];

export function normalizeTrackText(value: string | undefined | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreTrackSearchResult(track: CanonicalTrack, result: any): number {
  const wantedTitle = normalizeTrackText(track.title);
  const wantedArtist = normalizeTrackText(track.artist);
  const resultTitle = normalizeTrackText(result?.trackName);
  const resultArtist = normalizeTrackText(result?.artistName);

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
    .map((item: any) => ({ item, score: scoreTrackSearchResult(track, item) }))
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

  const cacheKey = `${normalizeTrackText(track.artist)}::${normalizeTrackText(track.title)}`;
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
  previewCache.delete(`${normalizeTrackText(track.artist)}::${normalizeTrackText(track.title)}`);
}

const artworkCache = new Map<string, { url: string | null; expiresAt: number }>();

function upscaleItunesArtwork(url: string): string {
  return url.replace(/\/\d+x\d+(bb|cc|sr)?\.(jpg|png)/i, '/600x600bb.$2');
}

async function searchArtwork(track: CanonicalTrack, country: string): Promise<string | null> {
  const term = encodeURIComponent(`${track.artist} ${track.title}`.trim());
  const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=12&country=${country}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const best = results
    .filter((item: any) => typeof item?.artworkUrl100 === 'string' && item.artworkUrl100.length > 0)
    .map((item: any) => ({ item, score: scoreTrackSearchResult(track, item) }))
    .sort((a: any, b: any) => b.score - a.score)[0];
  // Même seuil que l'extrait : titre ET artiste doivent correspondre, jamais une pochette au hasard.
  return best?.score >= 7 ? upscaleItunesArtwork(String(best.item.artworkUrl100)) : null;
}

/**
 * Adel (10/10/2026) : « on ne voit même pas la jaquette quand le morceau est trouvé ». Quand la reconnaissance ne fournit
 * aucune image, on la cherche par titre + artiste (recherche iTunes publique). Un échec n'est jamais mis en cache longtemps.
 */
export async function resolveTrackArtworkUrl(track: Pick<CanonicalTrack, 'title' | 'artist' | 'artworkUrl'>): Promise<string | null> {
  const existing = track.artworkUrl?.trim();
  if (existing) return existing;
  const key = `${normalizeTrackText(track.artist)}::${normalizeTrackText(track.title)}`;
  const cached = artworkCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  let artwork: string | null = null;
  for (const country of STOREFRONTS) {
    try {
      artwork = await searchArtwork(track as CanonicalTrack, country);
      if (artwork) break;
    } catch {
      // storefront suivant
    }
  }
  artworkCache.set(key, { url: artwork, expiresAt: Date.now() + (artwork ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS) });
  return artwork;
}
