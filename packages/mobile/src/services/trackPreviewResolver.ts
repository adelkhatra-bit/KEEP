import type { CanonicalTrack } from '@keep/music';

const previewCache = new Map<string, string | null>();

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

/**
 * KEEP ne stocke aucun fichier audio. Si un morceau public ne possède pas
 * encore d'extrait dans Supabase, on cherche à la volée un extrait
 * promotionnel public via iTunes Search. Aucun compte ni abonnement externe
 * n'est requis et le résultat reste uniquement en mémoire sur l'appareil.
 */
export async function resolveTrackPreviewUrl(track: CanonicalTrack): Promise<string | null> {
  const existing = track.previewUrl?.trim();
  if (existing) return existing;

  const cacheKey = `${normalize(track.artist)}::${normalize(track.title)}`;
  if (previewCache.has(cacheKey)) return previewCache.get(cacheKey) ?? null;

  try {
    const term = encodeURIComponent(`${track.artist} ${track.title}`.trim());
    const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8&country=FR`);
    if (!response.ok) {
      previewCache.set(cacheKey, null);
      return null;
    }

    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const best = results
      .filter((item: any) => typeof item?.previewUrl === 'string' && item.previewUrl.length > 0)
      .map((item: any) => ({ item, score: scoreResult(track, item) }))
      .sort((a: any, b: any) => b.score - a.score)[0];

    const preview = best?.score >= 7 ? String(best.item.previewUrl) : null;
    previewCache.set(cacheKey, preview);
    return preview;
  } catch {
    previewCache.set(cacheKey, null);
    return null;
  }
}
