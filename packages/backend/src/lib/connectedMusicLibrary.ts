import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getIntegrationSecret } from './integrationSecrets';

type Provider = 'spotify' | 'deezer';

export interface LibraryPlaylist {
  provider: Provider;
  id: string;
  name: string;
  description?: string | null;
  trackCount: number;
  imageUrl?: string | null;
  externalUrl?: string | null;
}

export interface LibraryTrack {
  provider: Provider;
  id: string;
  uri?: string;
  isrc?: string;
  title: string;
  artist: string;
  album?: string;
}

export interface CanonicalTrackInput {
  isrc?: string;
  title: string;
  artist: string;
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role non configuré');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function connection(profileId: string, provider: Provider) {
  const { data, error } = await db()
    .from('music_provider_connections')
    .select('provider,provider_user_id,access_token,refresh_token,expires_at')
    .eq('profile_id', profileId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

async function saveSpotifyTokens(profileId: string, accessToken: string, refreshToken: string | undefined, expiresIn: number | undefined) {
  const patch: Record<string, unknown> = {
    access_token: accessToken,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (refreshToken) patch.refresh_token = refreshToken;
  const { error } = await db().from('music_provider_connections').update(patch).eq('profile_id', profileId).eq('provider', 'spotify');
  if (error) throw error;
}

async function spotifyToken(profileId: string): Promise<string | null> {
  const conn = await connection(profileId, 'spotify');
  if (!conn?.access_token) return null;
  const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : Infinity;
  if (expiresAt > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const [clientId, clientSecret] = await Promise.all([
    getIntegrationSecret('SPOTIFY_CLIENT_ID'),
    getIntegrationSecret('SPOTIFY_CLIENT_SECRET'),
  ]);
  if (!clientId || !clientSecret) throw new Error('Spotify : client ID/secret manquants');

  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await axios.post('https://accounts.spotify.com/api/token', body.toString(), {
    headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
    timeout: 15000,
  });
  await saveSpotifyTokens(profileId, response.data.access_token, response.data.refresh_token, response.data.expires_in);
  return response.data.access_token;
}

async function deezerToken(profileId: string): Promise<string | null> {
  const conn = await connection(profileId, 'deezer');
  return conn?.access_token || null;
}

async function spotifyGetAll<T = any>(url: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = url;
  let page = 0;
  while (next && page < 50) {
    const response: any = await axios.get(next, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    items.push(...(response.data?.items || []));
    next = response.data?.next || null;
    page += 1;
  }
  return items;
}

async function deezerGetAll<T = any>(url: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = url;
  let page = 0;
  while (next && page < 50) {
    const response: any = await axios.get(next, { params: page === 0 ? { access_token: token, limit: 100 } : undefined, timeout: 15000 });
    if (response.data?.error) throw new Error(response.data.error.message || 'Deezer API error');
    items.push(...(response.data?.data || []));
    next = response.data?.next || null;
    page += 1;
  }
  return items;
}

export async function listConnectedPlaylists(profileId: string): Promise<LibraryPlaylist[]> {
  const output: LibraryPlaylist[] = [];
  const [spotify, deezer] = await Promise.all([spotifyToken(profileId), deezerToken(profileId)]);

  if (spotify) {
    const playlists = await spotifyGetAll<any>('https://api.spotify.com/v1/me/playlists?limit=50', spotify);
    output.push(...playlists.map((p) => ({
      provider: 'spotify' as const,
      id: p.id,
      name: p.name,
      description: p.description || null,
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      imageUrl: p.images?.[0]?.url || null,
      externalUrl: p.external_urls?.spotify || null,
    })));
  }

  if (deezer) {
    const playlists = await deezerGetAll<any>('https://api.deezer.com/user/me/playlists', deezer);
    output.push(...playlists.map((p) => ({
      provider: 'deezer' as const,
      id: String(p.id),
      name: p.title,
      description: null,
      trackCount: p.nb_tracks || 0,
      imageUrl: p.picture_medium || p.picture || null,
      externalUrl: p.link || null,
    })));
  }

  return output;
}

export async function getConnectedPlaylistTracks(profileId: string, provider: Provider, playlistId: string): Promise<LibraryTrack[]> {
  if (provider === 'spotify') {
    const token = await spotifyToken(profileId);
    if (!token) return [];
    const items = await spotifyGetAll<any>(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50`, token);
    return items
      .map((entry) => entry?.item || entry?.track)
      .filter((track) => track?.type === 'track' || track?.id)
      .map((track) => ({
        provider,
        id: track.id,
        uri: track.uri,
        isrc: track.external_ids?.isrc,
        title: track.name,
        artist: track.artists?.map((a: any) => a.name).join(', ') || '',
        album: track.album?.name,
      }));
  }

  const token = await deezerToken(profileId);
  if (!token) return [];
  const tracks = await deezerGetAll<any>(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks`, token);
  return tracks.map((track) => ({
    provider,
    id: String(track.id),
    isrc: track.isrc || undefined,
    title: track.title,
    artist: track.artist?.name || '',
    album: track.album?.title,
  }));
}

function normalized(value: string | undefined): string {
  return (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sameCanonicalTrack(a: CanonicalTrackInput, b: LibraryTrack): boolean {
  if (a.isrc && b.isrc) return a.isrc.toUpperCase() === b.isrc.toUpperCase();
  return normalized(a.title) === normalized(b.title) && normalized(a.artist) === normalized(b.artist);
}

export async function findTrackAcrossConnectedPlaylists(profileId: string, track: CanonicalTrackInput) {
  const playlists = await listConnectedPlaylists(profileId);
  for (const playlist of playlists) {
    const tracks = await getConnectedPlaylistTracks(profileId, playlist.provider, playlist.id);
    if (tracks.some((candidate) => sameCanonicalTrack(track, candidate))) {
      return {
        exists: true,
        match: {
          provider: playlist.provider,
          playlistId: playlist.id,
          playlistName: playlist.name,
        },
      };
    }
  }
  return { exists: false, match: null };
}

async function resolveSpotifyTrack(profileId: string, track: CanonicalTrackInput): Promise<LibraryTrack> {
  const token = await spotifyToken(profileId);
  if (!token) throw new Error('Spotify non connecté');
  const query = track.isrc ? `isrc:${track.isrc}` : `track:${track.title} artist:${track.artist}`;
  const response = await axios.get('https://api.spotify.com/v1/search', {
    params: { q: query, type: 'track', limit: 5 },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  const found = (response.data?.tracks?.items || []).find((item: any) => sameCanonicalTrack(track, {
    provider: 'spotify',
    id: item.id,
    isrc: item.external_ids?.isrc,
    title: item.name,
    artist: item.artists?.map((a: any) => a.name).join(', ') || '',
  })) || response.data?.tracks?.items?.[0];
  if (!found) throw new Error('Morceau introuvable sur Spotify');
  return {
    provider: 'spotify',
    id: found.id,
    uri: found.uri,
    isrc: found.external_ids?.isrc,
    title: found.name,
    artist: found.artists?.map((a: any) => a.name).join(', ') || '',
  };
}

async function resolveDeezerTrack(profileId: string, track: CanonicalTrackInput): Promise<LibraryTrack> {
  const token = await deezerToken(profileId);
  if (!token) throw new Error('Deezer non connecté');
  let data: any;
  if (track.isrc) {
    const response = await axios.get(`https://api.deezer.com/track/isrc:${encodeURIComponent(track.isrc)}`, { params: { access_token: token }, timeout: 15000 });
    data = response.data;
  }
  if (!data?.id) {
    const query = `track:"${track.title}" artist:"${track.artist}"`;
    const response = await axios.get('https://api.deezer.com/search', { params: { q: query, access_token: token, limit: 10 }, timeout: 15000 });
    data = response.data?.data?.[0];
  }
  if (!data?.id) throw new Error('Morceau introuvable sur Deezer');
  return {
    provider: 'deezer',
    id: String(data.id),
    isrc: data.isrc || undefined,
    title: data.title,
    artist: data.artist?.name || '',
  };
}

export async function addTrackToConnectedPlaylist(profileId: string, provider: Provider, playlistId: string, track: CanonicalTrackInput) {
  const existing = await getConnectedPlaylistTracks(profileId, provider, playlistId);
  if (existing.some((candidate) => sameCanonicalTrack(track, candidate))) {
    return { added: false, alreadyExists: true };
  }

  if (provider === 'spotify') {
    const token = await spotifyToken(profileId);
    if (!token) throw new Error('Spotify non connecté');
    const resolved = await resolveSpotifyTrack(profileId, track);
    await axios.post(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`,
      { uris: [resolved.uri || `spotify:track:${resolved.id}`] },
      { headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, timeout: 15000 },
    );
    return { added: true, alreadyExists: false, providerTrackId: resolved.id };
  }

  const token = await deezerToken(profileId);
  if (!token) throw new Error('Deezer non connecté');
  const resolved = await resolveDeezerTrack(profileId, track);
  const response = await axios.post(
    `https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks`,
    null,
    { params: { access_token: token, songs: resolved.id }, timeout: 15000 },
  );
  if (response.data?.error) throw new Error(response.data.error.message || 'Échec ajout Deezer');
  return { added: true, alreadyExists: false, providerTrackId: resolved.id };
}
