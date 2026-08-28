import type { CanonicalTrack } from './types';

export type MusicArtistGroup = {
  key: string;
  name: string;
  tracks: CanonicalTrack[];
  trackCount: number;
};

export type MusicAlbumGroup = {
  key: string;
  name: string;
  artist: string;
  tracks: CanonicalTrack[];
  trackCount: number;
  artworkUrl?: string;
};

export function normalizeMusicText(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9&+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pour la navigation discographique, KEEP regroupe un featuring sous
 * l'artiste principal sans casser les vrais noms de groupes contenant '&'.
 */
export function primaryArtistName(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0]
    .trim();
}

export function canonicalTrackIdentity(track: Pick<CanonicalTrack, 'id' | 'isrc' | 'title' | 'artist'>): string {
  const isrc = track.isrc?.trim().toUpperCase();
  if (isrc) return `isrc:${isrc}`;
  const title = normalizeMusicText(track.title);
  const artist = normalizeMusicText(primaryArtistName(track.artist));
  return track.id ? `id:${track.id}` : `text:${artist}|${title}`;
}

export function canonicalArtistIdentity(track: Pick<CanonicalTrack, 'artist'>): string {
  return normalizeMusicText(primaryArtistName(track.artist));
}

export function canonicalAlbumIdentity(track: Pick<CanonicalTrack, 'album' | 'artist' | 'providerIds'>): string | null {
  if (!track.album?.trim()) return null;
  const providerIds = track.providerIds ?? {};
  const releaseGroup = providerIds.musicBrainzReleaseGroup || providerIds.musicbrainzReleaseGroup;
  if (releaseGroup) return `mb-release-group:${String(releaseGroup)}`;
  const appleCollection = providerIds.appleMusicCollection || providerIds.appleCollection;
  if (appleCollection) return `apple-collection:${String(appleCollection)}`;
  const album = normalizeMusicText(track.album);
  const artist = canonicalArtistIdentity(track);
  return `text:${artist}|${album}`;
}

function dedupeTracks(tracks: CanonicalTrack[]): CanonicalTrack[] {
  const unique = new Map<string, CanonicalTrack>();
  for (const track of tracks) {
    const key = canonicalTrackIdentity(track);
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, track);
      continue;
    }
    const previousScore = Number(Boolean(previous.isrc)) * 4 + Number(Boolean(previous.album)) * 2 + Number(Boolean(previous.artworkUrl));
    const nextScore = Number(Boolean(track.isrc)) * 4 + Number(Boolean(track.album)) * 2 + Number(Boolean(track.artworkUrl));
    if (nextScore > previousScore) unique.set(key, track);
  }
  return Array.from(unique.values());
}

export function groupTracksByArtist(tracks: CanonicalTrack[]): MusicArtistGroup[] {
  const buckets = new Map<string, { name: string; tracks: CanonicalTrack[] }>();
  for (const track of dedupeTracks(tracks)) {
    const name = primaryArtistName(track.artist) || track.artist.trim();
    const key = normalizeMusicText(name);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { name, tracks: [] };
    bucket.tracks.push(track);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([key, value]) => ({ key, name: value.name, tracks: value.tracks, trackCount: value.tracks.length }))
    .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
}

export function groupTracksByAlbum(tracks: CanonicalTrack[]): MusicAlbumGroup[] {
  const buckets = new Map<string, { name: string; artist: string; tracks: CanonicalTrack[]; artworkUrl?: string }>();
  for (const track of dedupeTracks(tracks)) {
    const key = canonicalAlbumIdentity(track);
    if (!key || !track.album?.trim()) continue;
    const artist = primaryArtistName(track.artist) || track.artist.trim();
    const bucket = buckets.get(key) ?? { name: track.album.trim(), artist, tracks: [], artworkUrl: track.artworkUrl };
    bucket.tracks.push(track);
    if (!bucket.artworkUrl && track.artworkUrl) bucket.artworkUrl = track.artworkUrl;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .map(([key, value]) => ({ key, name: value.name, artist: value.artist, tracks: value.tracks, trackCount: value.tracks.length, artworkUrl: value.artworkUrl }))
    .sort((a, b) => b.trackCount - a.trackCount || a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name));
}
