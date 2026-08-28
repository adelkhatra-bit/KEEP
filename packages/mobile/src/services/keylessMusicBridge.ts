import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import type { CanonicalTrack } from '@keep/music';

export type MusicServiceKey = 'apple_music' | 'spotify' | 'deezer' | 'youtube_music' | 'soundcloud' | 'tidal';

export type KeylessExportTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
};

export type KeylessExportQueue = {
  name: string;
  tracks: KeylessExportTrack[];
  createdAt: string;
};

export const KEYLESS_MUSIC_SERVICES: Array<{
  key: MusicServiceKey;
  name: string;
  shortDescription: string;
}> = [
  { key: 'apple_music', name: 'Apple Music', shortDescription: 'Recherche exacte puis ajout dans Apple Music' },
  { key: 'spotify', name: 'Spotify', shortDescription: 'Recherche exacte puis ajout dans Spotify' },
  { key: 'deezer', name: 'Deezer', shortDescription: 'Recherche exacte puis ajout dans Deezer' },
  { key: 'youtube_music', name: 'YouTube Music', shortDescription: 'Recherche exacte dans YouTube Music' },
  { key: 'soundcloud', name: 'SoundCloud', shortDescription: 'Recherche exacte dans SoundCloud' },
  { key: 'tidal', name: 'TIDAL', shortDescription: 'Recherche exacte dans TIDAL' },
];

const STORAGE_KEY = 'keep:keyless-music-export:v1';

function queryForTrack(track: KeylessExportTrack) {
  return `${track.artist} ${track.title}`.trim();
}

export function buildMusicServiceSearchUrl(service: MusicServiceKey, track?: KeylessExportTrack): string {
  const query = track ? queryForTrack(track) : '';
  const encoded = encodeURIComponent(query);

  switch (service) {
    case 'apple_music':
      return query ? `https://music.apple.com/fr/search?term=${encoded}` : 'https://music.apple.com/fr';
    case 'spotify':
      return query ? `https://open.spotify.com/search/${encoded}` : 'https://open.spotify.com';
    case 'deezer':
      return query ? `https://www.deezer.com/search/${encoded}` : 'https://www.deezer.com';
    case 'youtube_music':
      return query ? `https://music.youtube.com/search?q=${encoded}` : 'https://music.youtube.com';
    case 'soundcloud':
      return query ? `https://soundcloud.com/search?q=${encoded}` : 'https://soundcloud.com';
    case 'tidal':
      return query ? `https://listen.tidal.com/search?q=${encoded}` : 'https://listen.tidal.com';
  }
}

export async function openMusicService(service: MusicServiceKey, track?: KeylessExportTrack): Promise<void> {
  const url = buildMusicServiceSearchUrl(service, track);
  await Linking.openURL(url);
}

export async function prepareKeylessMusicExport(name: string, tracks: CanonicalTrack[]): Promise<KeylessExportQueue> {
  const unique = new Map<string, KeylessExportTrack>();
  for (const track of tracks) {
    const title = String(track.title ?? '').trim();
    const artist = String(track.artist ?? '').trim();
    if (!title || !artist) continue;
    const key = track.isrc?.trim().toUpperCase() || `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (!unique.has(key)) {
      unique.set(key, {
        id: String(track.id ?? key),
        title,
        artist,
        album: track.album ? String(track.album) : undefined,
      });
    }
  }

  const queue: KeylessExportQueue = {
    name: name.trim() || 'Ma sélection KEEP',
    tracks: Array.from(unique.values()),
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  return queue;
}

export async function loadKeylessMusicExport(): Promise<KeylessExportQueue | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KeylessExportQueue;
    if (!parsed || !Array.isArray(parsed.tracks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearKeylessMusicExport(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
