import type { CanonicalTrack } from '@keep/music';

export type KeepProviderIdentity = { provider: string; value: string };

type TrackIdentityShape = Pick<CanonicalTrack, 'id' | 'isrc' | 'title' | 'artist' | 'providerIds'>;

export type KeepTrackIdentityIndex = {
  ids: Set<string>;
  isrcs: Set<string>;
  providerIds: Set<string>;
};

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

const TRACK_LEVEL_PROVIDER_IDS = new Set([
  'applemusic',
  'spotify',
  'deezer',
  'youtube',
  'youtubemusic',
  'musicbrainz',
  'musicbrainzrecording',
]);

export function keepProviderIdentities(track: Pick<CanonicalTrack, 'providerIds'>): KeepProviderIdentity[] {
  const ids = track.providerIds && typeof track.providerIds === 'object' ? track.providerIds : {};
  const seen = new Set<string>();
  const result: KeepProviderIdentity[] = [];

  for (const [rawProvider, rawValue] of Object.entries(ids)) {
    const provider = String(rawProvider || '').trim();
    const value = String(rawValue || '').trim();
    if (!provider || !value) continue;

    // Only a TRACK identifier may prove that two songs are the same.
    // Context metadata such as appleStorefront='FR'/'US', country/market,
    // album/collection IDs, etc. is intentionally excluded. Treating a
    // storefront as a song ID made every Apple Music track from the same
    // country look like a duplicate in Loki Pulse.
    if (!TRACK_LEVEL_PROVIDER_IDS.has(provider.toLowerCase())) continue;

    const key = `${provider.toLowerCase()}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ provider, value });
  }
  return result;
}


/**
 * Identité forte uniquement : ISRC > identifiant fournisseur de piste > id canonique.
 * Le couple titre/artiste n'est volontairement JAMAIS une preuve de doublon :
 * deux versions portant le même nom peuvent avoir un contenu audio/paroles différent.
 */
export function strongKeepTrackIdentity(track: TrackIdentityShape): string {
  const isrc = String(track.isrc || '').trim().toUpperCase();
  if (isrc) return `isrc:${isrc}`;
  const providers = keepProviderIdentities(track)
    .map(({ provider, value }) => `${provider.toLowerCase()}::${value}`)
    .sort();
  if (providers.length) return `provider:${providers[0]}`;
  const id = String(track.id || '').trim();
  return id ? `id:${id}` : '';
}

export function buildKeepTrackIdentityIndex(tracks: TrackIdentityShape[]): KeepTrackIdentityIndex {
  const index: KeepTrackIdentityIndex = {
    ids: new Set<string>(),
    isrcs: new Set<string>(),
    providerIds: new Set<string>(),
  };

  for (const track of tracks) {
    const id = String(track.id || '').trim();
    if (id) index.ids.add(id);

    const isrc = String(track.isrc || '').trim().toUpperCase();
    if (isrc) index.isrcs.add(isrc);

    for (const provider of keepProviderIdentities(track)) {
      index.providerIds.add(`${provider.provider.toLowerCase()}::${provider.value}`);
    }
  }

  return index;
}

export function trackExistsInKeepIndex(index: KeepTrackIdentityIndex, track: TrackIdentityShape): boolean {
  const id = String(track.id || '').trim();
  if (id && index.ids.has(id)) return true;

  const isrc = String(track.isrc || '').trim().toUpperCase();
  if (isrc && index.isrcs.has(isrc)) return true;

  for (const provider of keepProviderIdentities(track)) {
    if (index.providerIds.has(`${provider.provider.toLowerCase()}::${provider.value}`)) return true;
  }

  return false;
}

export function filterTracksNotAlreadyKept<T extends TrackIdentityShape>(
  tracks: T[],
  index: KeepTrackIdentityIndex,
): T[] {
  return tracks.filter((track) => !trackExistsInKeepIndex(index, track));
}

export function tracksRepresentSameKeep(a: TrackIdentityShape, b: TrackIdentityShape): boolean {
  const index = buildKeepTrackIdentityIndex([b]);
  return trackExistsInKeepIndex(index, a);
}
