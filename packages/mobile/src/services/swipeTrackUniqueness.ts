import type { CanonicalTrack } from '@keep/music';
import { keepProviderIdentities } from './keepTrackIdentity';

/** Exact visible song identity. Unlike fuzzy music searches, do not strip
 * "live", "remix", "remaster" or featured artists: distinct editions
 * must remain available, but an identical title + artist cannot appear
 * twenty-seven times under different genres/distributor IDs. */
export function displayedSongIdentity(title?: string | null, artist?: string | null): string {
  const normalize = (text: string) => (text || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const t = normalize(title || '');
  const a = normalize(artist || '');
  return t && a ? `${a}::${t}` : '';
}

/** A single Swipe/Profile/Story deck may never show the same song repeatedly.
 * Source IDs and genres don't define a separate piece of music. The original
 * track is kept intact (first discoverer, cover and audio URL included). */
export function uniqueSwipeTracks<T extends Pick<CanonicalTrack, 'id' | 'title' | 'artist' | 'isrc' | 'providerIds'>>(tracks: T[]): T[] {
  const identities = new Set<string>();
  const result: T[] = [];
  for (const track of tracks) {
    const keys = [
      track.id ? `id:${track.id}` : '',
      track.isrc ? `isrc:${track.isrc.trim().toUpperCase()}` : '',
      ...keepProviderIdentities(track).map(({ provider, value }) => `provider:${provider.toLowerCase()}::${value}`),
      displayedSongIdentity(track.title, track.artist) ? `song:${displayedSongIdentity(track.title, track.artist)}` : '',
    ].filter(Boolean);
    if (keys.some((key) => identities.has(key))) continue;
    result.push(track);
    keys.forEach((key) => identities.add(key));
  }
  return result;
}
