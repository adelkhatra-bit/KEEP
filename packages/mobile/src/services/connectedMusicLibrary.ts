import { CanonicalTrack } from '@keep/music';
import { getSupabaseAccessToken } from './supabaseClient';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

function usableApiUrl(): string | null {
  if (!API_URL || API_URL.startsWith('your_') || API_URL === 'undefined') return null;
  return API_URL.replace(/\/$/, '');
}

async function authHeaders() {
  const token = await getSupabaseAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export async function checkConnectedLibraries(track: CanonicalTrack): Promise<{
  exists: boolean;
  match: { provider: string; playlistId: string; playlistName: string } | null;
} | null> {
  const base = usableApiUrl();
  const headers = await authHeaders();
  if (!base || !headers) return null;

  const response = await fetch(`${base}/api/music/library/check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ isrc: track.isrc, title: track.title, artist: track.artist }),
  });

  if (!response.ok) {
    // Une panne d'une plateforme ne doit pas bloquer toute la session KEEP.
    // Le moteur continuera avec le provider principal et affichera l'erreur
    // seulement dans les écrans de gestion de connexion.
    return null;
  }
  return response.json();
}

export interface ConnectedPlaylist {
  provider: 'spotify' | 'deezer';
  id: string;
  name: string;
  description?: string | null;
  trackCount: number;
  imageUrl?: string | null;
  externalUrl?: string | null;
}

export async function getConnectedPlaylists(): Promise<ConnectedPlaylist[]> {
  const base = usableApiUrl();
  const headers = await authHeaders();
  if (!base || !headers) return [];
  const response = await fetch(`${base}/api/music/library/playlists`, { headers });
  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function addToConnectedPlaylist(args: {
  provider: 'spotify' | 'deezer';
  playlistId: string;
  track: CanonicalTrack;
}) {
  const base = usableApiUrl();
  const headers = await authHeaders();
  if (!base || !headers) throw new Error('Backend KEEP ou session utilisateur non disponible.');
  const response = await fetch(`${base}/api/music/library/add`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: args.provider,
      playlistId: args.playlistId,
      track: { isrc: args.track.isrc, title: args.track.title, artist: args.track.artist },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.message || json?.error || 'Échec ajout dans la playlist connectée.');
  return json;
}
