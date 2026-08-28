import type { CanonicalTrack } from '@keep/music';

export type KeepProviderIdentity = { provider: string; value: string };

export function normalizeKeepTrackText(value: string | undefined | null): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(feat|featuring|ft)\.?\s+[^()\[\]-]+/g, ' ')
    .replace(/\b(album version|radio edit|single version|remaster(?:ed)?(?: \d{4})?|explicit|clean)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function keepProviderIdentities(track: Pick<CanonicalTrack, 'providerIds'>): KeepProviderIdentity[] {
  const ids = track.providerIds && typeof track.providerIds === 'object' ? track.providerIds : {};
  const seen = new Set<string>();
  const result: KeepProviderIdentity[] = [];

  for (const [rawProvider, rawValue] of Object.entries(ids)) {
    const provider = String(rawProvider || '').trim();
    const value = String(rawValue || '').trim();
    if (!provider || !value) continue;
    const key = `${provider.toLowerCase()}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ provider, value });
  }
  return result;
}

export function tracksRepresentSameKeep(
  a: Pick<CanonicalTrack, 'id' | 'isrc' | 'title' | 'artist' | 'providerIds'>,
  b: Pick<CanonicalTrack, 'id' | 'isrc' | 'title' | 'artist' | 'providerIds'>,
): boolean {
  const aId = String(a.id || '').trim();
  const bId = String(b.id || '').trim();
  if (aId && bId && aId === bId) return true;

  const aIsrc = String(a.isrc || '').trim().toUpperCase();
  const bIsrc = String(b.isrc || '').trim().toUpperCase();
  if (aIsrc && bIsrc && aIsrc === bIsrc) return true;

  const bProviders = new Map(keepProviderIdentities(b).map((item) => [item.provider.toLowerCase(), item.value]));
  for (const item of keepProviderIdentities(a)) {
    if (bProviders.get(item.provider.toLowerCase()) === item.value) return true;
  }

  const aTitle = normalizeKeepTrackText(a.title);
  const bTitle = normalizeKeepTrackText(b.title);
  const aArtist = normalizeKeepTrackText(a.artist);
  const bArtist = normalizeKeepTrackText(b.artist);
  return Boolean(aTitle && bTitle && aArtist && bArtist && aTitle === bTitle && aArtist === bArtist);
}
