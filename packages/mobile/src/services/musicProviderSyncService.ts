import { Linking, Platform } from 'react-native';
import { getSupabaseAccessToken } from './supabaseClient';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type SyncProvider = 'spotify' | 'deezer' | 'youtube_music' | 'soundcloud';
export type ImportProvider = 'spotify' | 'deezer';
export type ImportedMusicVisibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

export type ProviderConnectionState = {
  configured: boolean;
  connected: boolean;
  connection: {
    provider?: string;
    provider_user_id?: string | null;
    connected_at?: string | null;
    expires_at?: string | null;
  } | null;
};

export type ProviderConnectionMap = {
  spotify: ProviderConnectionState;
  deezer: ProviderConnectionState;
  youtube_music: ProviderConnectionState;
  soundcloud: ProviderConnectionState;
};

export type ImportedMusicItem = {
  id: string;
  provider: ImportProvider;
  provider_track_id: string;
  provider_uri?: string | null;
  isrc?: string | null;
  title: string;
  artist: string;
  album?: string | null;
  artwork_url?: string | null;
  source_kind: string;
  visibility: ImportedMusicVisibility;
  imported_at: string;
  last_seen_at: string;
  metadata?: Record<string, unknown> | null;
};

function baseUrl(): string {
  if (!API_URL || API_URL === 'undefined' || API_URL.startsWith('your_')) {
    throw new Error('Backend KEEP non configuré.');
  }
  return API_URL.replace(/\/$/, '');
}

async function headers(json = true) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.message || payload?.error || `HTTP ${response.status}`));
  return payload;
}

export async function loadProviderConnectionStates(): Promise<ProviderConnectionMap> {
  const response = await fetch(`${baseUrl()}/api/music/connections/status`, {
    headers: await headers(false),
  });
  const payload = await readJson(response);
  const providers = payload?.providers ?? {};
  const empty = { configured: false, connected: false, connection: null };
  return {
    spotify: { ...empty, ...(providers.spotify ?? {}) },
    deezer: { ...empty, ...(providers.deezer ?? {}) },
    youtube_music: { ...empty, ...(providers.youtube_music ?? {}) },
    soundcloud: { ...empty, ...(providers.soundcloud ?? {}) },
  };
}

/**
 * Demande au backend KEEP une URL OAuth signée pour le compte connecté, puis
 * ouvre le fournisseur. Le secret Spotify/Deezer ne transite jamais dans le
 * mobile. Le backend encode aussi la surface de départ dans le state signé :
 * web -> retour HTTPS KEEP, natif -> keep://music-connections.
 */
export async function startProviderConnection(provider: SyncProvider): Promise<void> {
  const client = Platform.OS === 'web' ? 'web' : 'native';
  const response = await fetch(`${baseUrl()}/api/music/connections/start/${provider}?response=json&client=${client}`, {
    headers: await headers(false),
  });
  const payload = await readJson(response);
  const url = String(payload?.authorizationUrl || '');
  if (!/^https:\/\//i.test(url)) throw new Error('URL OAuth fournisseur invalide.');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Navigation dans l'onglet courant : Safari iOS revient ensuite sur KEEP
    // au lieu de conserver un onglet intermédiaire about:blank.
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

export async function disconnectProvider(provider: SyncProvider): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/music/connections/${provider}`, {
    method: 'DELETE',
    headers: await headers(false),
  });
  await readJson(response);
}

export async function importProviderFavorites(provider: ImportProvider): Promise<{ provider: ImportProvider; imported: number; syncedAt: string }> {
  const response = await fetch(`${baseUrl()}/api/music/library/import/${provider}`, {
    method: 'POST',
    headers: await headers(),
    body: '{}',
  });
  return readJson(response);
}

export async function loadImportedMusic(limit = 2000): Promise<ImportedMusicItem[]> {
  const response = await fetch(`${baseUrl()}/api/music/library/imported?limit=${Math.max(1, Math.min(limit, 5000))}`, {
    headers: await headers(false),
  });
  const payload = await readJson(response);
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function setImportedMusicVisibility(itemId: string, visibility: ImportedMusicVisibility): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/music/library/imported/${encodeURIComponent(itemId)}/visibility`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify({ visibility }),
  });
  await readJson(response);
}

export async function syncKeepPlaylist(args: {
  keepPlaylistId: string;
  provider: SyncProvider;
  providerPlaylistId: string;
}): Promise<{
  total: number;
  added: number;
  alreadyExists: number;
  failed: number;
  failures: Array<{ title: string; artist: string; error: string }>;
}> {
  const response = await fetch(`${baseUrl()}/api/music/library/sync`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(args),
  });
  return readJson(response);
}
