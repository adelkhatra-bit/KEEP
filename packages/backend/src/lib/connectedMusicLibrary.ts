import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getIntegrationSecret } from './integrationSecrets';

type Provider = 'spotify' | 'deezer';

type ImportedVisibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

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
  artworkUrl?: string;
  externalUrl?: string;
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

function spotifyTrack(track: any): LibraryTrack | null {
  if (!track?.id || !track?.name) return null;
  return {
    provider: 'spotify',
    id: String(track.id),
    uri: track.uri || undefined,
    isrc: track.external_ids?.isrc || undefined,
    title: String(track.name),
    artist: track.artists?.map((a: any) => a.name).filter(Boolean).join(', ') || '',
    album: track.album?.name || undefined,
    artworkUrl: track.album?.images?.[0]?.url || undefined,
    externalUrl: track.external_urls?.spotify || undefined,
  };
}

function deezerTrack(track: any): LibraryTrack | null {
  if (!track?.id || !track?.title) return null;
  return {
    provider: 'deezer',
    id: String(track.id),
    isrc: track.isrc || undefined,
    title: String(track.title),
    artist: track.artist?.name || '',
    album: track.album?.title || undefined,
    artworkUrl: track.album?.cover_xl || track.album?.cover_big || track.album?.cover_medium || undefined,
    externalUrl: track.link || undefined,
  };
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
    return items.flatMap((entry) => {
      const mapped = spotifyTrack(entry?.item || entry?.track);
      return mapped ? [mapped] : [];
    });
  }

  const token = await deezerToken(profileId);
  if (!token) return [];
  const tracks = await deezerGetAll<any>(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}/tracks`, token);
  return tracks.flatMap((track) => {
    const mapped = deezerTrack(track);
    return mapped ? [mapped] : [];
  });
}

/**
 * Lit les titres réellement aimés/enregistrés par l'utilisateur chez le
 * fournisseur. KEEP ne récupère ici que les métadonnées autorisées par OAuth :
 * jamais les octets audio protégés ni un fichier téléchargeable.
 */
export async function getConnectedSavedTracks(profileId: string, provider: Provider): Promise<LibraryTrack[]> {
  if (provider === 'spotify') {
    const token = await spotifyToken(profileId);
    if (!token) throw new Error('Spotify non connecté');
    const items = await spotifyGetAll<any>('https://api.spotify.com/v1/me/tracks?limit=50', token);
    return items.flatMap((entry) => {
      const mapped = spotifyTrack(entry?.item || entry?.track || entry);
      return mapped ? [mapped] : [];
    });
  }

  const token = await deezerToken(profileId);
  if (!token) throw new Error('Deezer non connecté');
  const items = await deezerGetAll<any>('https://api.deezer.com/user/me/tracks', token);
  return items.flatMap((entry) => {
    const mapped = deezerTrack(entry);
    return mapped ? [mapped] : [];
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}

/**
 * Miroir metadata-only de la bibliothèque du fournisseur vers KEEP.
 * Les lignes disparues du fournisseur sont soft-delete ; les préférences de
 * visibilité déjà choisies dans KEEP ne sont jamais écrasées lors d'un resync.
 */
export async function importConnectedSavedLibrary(profileId: string, provider: Provider) {
  const tracks = await getConnectedSavedTracks(profileId, provider);
  const database = db();
  const now = new Date().toISOString();

  const { error: markError } = await database
    .from('music_library_items')
    .update({ removed_at: now })
    .eq('profile_id', profileId)
    .eq('provider', provider)
    .eq('source_kind', 'saved')
    .is('removed_at', null);
  if (markError) throw markError;

  const rows = tracks.map((track) => ({
    profile_id: profileId,
    provider,
    provider_track_id: track.id,
    provider_uri: track.uri || null,
    isrc: track.isrc || null,
    title: track.title,
    artist: track.artist,
    album: track.album || null,
    artwork_url: track.artworkUrl || null,
    source_kind: 'saved',
    source_playlist_id: null,
    last_seen_at: now,
    removed_at: null,
    metadata: {
      externalUrl: track.externalUrl || null,
      mirrorVersion: 1,
    },
  }));

  for (const batch of chunk(rows, 250)) {
    if (!batch.length) continue;
    const { error } = await database
      .from('music_library_items')
      .upsert(batch, { onConflict: 'profile_id,provider,provider_track_id' });
    if (error) throw error;
  }

  return { provider, imported: rows.length, syncedAt: now };
}

export async function listImportedMusicLibrary(profileId: string, limit = 2000) {
  const { data, error } = await db()
    .from('music_library_items')
    .select('id,provider,provider_track_id,track_id,provider_uri,isrc,title,artist,album,artwork_url,source_kind,source_playlist_id,visibility,imported_at,last_seen_at,metadata')
    .eq('profile_id', profileId)
    .is('removed_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 5000)));
  if (error) throw error;
  return data ?? [];
}

export async function setImportedMusicVisibility(profileId: string, itemId: string, visibility: ImportedVisibility) {
  if (!['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(visibility)) throw new Error('Visibilité invalide');
  const { data, error } = await db()
    .from('music_library_items')
    .update({ visibility })
    .eq('id', itemId)
    .eq('profile_id', profileId)
    .select('id,visibility')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Morceau importé introuvable');
  return data;
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
  const mapped = spotifyTrack(found);
  if (!mapped) throw new Error('Réponse Spotify invalide');
  return mapped;
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
  const mapped = deezerTrack(data);
  if (!mapped) throw new Error('Réponse Deezer invalide');
  return mapped;
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

/**
 * Réinjecte une playlist/Vibe KEEP déjà triée dans une playlist du fournisseur.
 * On réutilise le dédoublonnage et la résolution ISRC/titre-artiste existants.
 */
export async function syncKeepPlaylistToConnectedProvider(args: {
  profileId: string;
  keepPlaylistId: string;
  provider: Provider;
  providerPlaylistId: string;
}) {
  const database = db();
  const { data: playlist, error: playlistError } = await database
    .from('playlists')
    .select('id,name')
    .eq('id', args.keepPlaylistId)
    .eq('owner_id', args.profileId)
    .maybeSingle();
  if (playlistError) throw playlistError;
  if (!playlist) throw new Error('Playlist KEEP introuvable');

  const { data: rows, error: tracksError } = await database
    .from('playlist_tracks')
    .select('track:tracks(isrc,title,artist)')
    .eq('playlist_id', args.keepPlaylistId)
    .order('added_at', { ascending: true });
  if (tracksError) throw tracksError;

  const tracks = (rows ?? []).flatMap((row: any) => {
    const track = Array.isArray(row.track) ? row.track[0] : row.track;
    if (!track?.title || !track?.artist) return [];
    return [{ isrc: track.isrc || undefined, title: String(track.title), artist: String(track.artist) }];
  });

  let added = 0;
  let alreadyExists = 0;
  const failures: Array<{ title: string; artist: string; error: string }> = [];

  for (const batch of chunk(tracks, 4)) {
    const results = await Promise.all(batch.map(async (track) => {
      try {
        return { track, result: await addTrackToConnectedPlaylist(args.profileId, args.provider, args.providerPlaylistId, track) };
      } catch (error: any) {
        return { track, error: String(error?.message || 'sync_failed') };
      }
    }));
    for (const item of results) {
      if ('error' in item) {
        failures.push({ title: item.track.title, artist: item.track.artist, error: item.error });
      } else if (item.result.added) added += 1;
      else if (item.result.alreadyExists) alreadyExists += 1;
    }
  }

  return {
    keepPlaylistId: args.keepPlaylistId,
    keepPlaylistName: playlist.name,
    provider: args.provider,
    providerPlaylistId: args.providerPlaylistId,
    total: tracks.length,
    added,
    alreadyExists,
    failed: failures.length,
    failures: failures.slice(0, 25),
  };
}
