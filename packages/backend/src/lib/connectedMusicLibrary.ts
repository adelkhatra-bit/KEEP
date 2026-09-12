import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getIntegrationSecret } from './integrationSecrets';
import { APP_NAME } from '../config/brand';

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
    .select('provider,provider_user_id,access_token,refresh_token,expires_at,scope')
    .eq('profile_id', profileId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

// Adel (02/09/2026) : "vice versa pour eviter les doublons" -- ecrire un like
// depuis un fournisseur vers l'autre exige un scope d'ECRITURE sur les
// favoris, distinct de la simple LECTURE deja utilisee par l'import manuel.
// Les deux scopes sont deja demandes a la connexion (musicConnections.ts),
// mais un compte connecte AVANT ce changement peut avoir un jeton plus
// ancien qui ne les couvre pas -- on verifie donc le scope stocke avant
// d'écrire, au lieu de supposer qu'il est toujours present.
const PROVIDER_WRITE_SCOPE: Record<Provider, string> = {
  spotify: 'user-library-modify',
  deezer: 'manage_library',
};

function hasWriteScope(provider: Provider, scope: string | null | undefined): boolean {
  if (!scope) return false;
  const needed = PROVIDER_WRITE_SCOPE[provider];
  return scope.split(/[\s,]+/).map((s) => s.trim()).includes(needed);
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
  if (!playlist) throw new Error(`Playlist ${APP_NAME} introuvable`);

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
        failures.push({ title: item.track.title, artist: item.track.artist, error: item.error ?? 'sync_failed' });
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

// AJOUT (02/09/2026, demande Adel : "je like sur Spotify ... est-ce que ça
// peut aller directement dans les autres plateformes ... vice versa pour
// eviter les doublons ... en mode extrait, dans les sessions"). Trouve ou
// crée la ligne canonique dans `tracks` (le même catalogue partagé que
// Découvertes/Battle) pour un morceau importé -- c'est cet id partagé qui
// permet de repérer "même morceau, provider différent" sans dépendre d'un
// ISRC toujours présent.
async function resolveCanonicalTrackId(track: LibraryTrack): Promise<string | null> {
  const database = db();
  if (track.isrc) {
    const { data: existing } = await database.from('tracks').select('id').eq('isrc', track.isrc).maybeSingle();
    if (existing?.id) return existing.id as string;
  }
  const { data: created, error } = await database
    .from('tracks')
    .insert({
      isrc: track.isrc || null,
      title: track.title,
      artist: track.artist,
      album: track.album || null,
      artwork_url: track.artworkUrl || null,
      provider_ids: track.provider === 'spotify' ? { spotify: track.id } : { deezer: track.id },
      source: `${track.provider}_favorites_sync`,
      external_urls: track.externalUrl ? { [track.provider]: track.externalUrl } : {},
      available_on: [track.provider === 'spotify' ? 'Spotify' : 'Deezer'],
    })
    .select('id')
    .single();
  if (error) {
    if (track.isrc) {
      const { data: retry } = await database.from('tracks').select('id').eq('isrc', track.isrc).maybeSingle();
      if (retry?.id) return retry.id as string;
    }
    return null;
  }
  return (created?.id as string) ?? null;
}

/**
 * Ajoute un morceau aux favoris ("Liked Songs"/bibliothèque) d'un
 * fournisseur -- pas à une playlist (addTrackToConnectedPlaylist ci-dessus
 * gère déjà ce cas séparé). Exige le scope d'écriture bibliothèque
 * (vérifié par l'appelant via hasWriteScope avant d'appeler cette fonction).
 */
export async function addTrackToFavorites(profileId: string, provider: Provider, track: CanonicalTrackInput): Promise<{ added: boolean; providerTrackId?: string }> {
  if (provider === 'spotify') {
    const token = await spotifyToken(profileId);
    if (!token) throw new Error('Spotify non connecté');
    const resolved = await resolveSpotifyTrack(profileId, track);
    await axios.put(
      'https://api.spotify.com/v1/me/tracks',
      { ids: [resolved.id] },
      { headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, timeout: 15000 },
    );
    return { added: true, providerTrackId: resolved.id };
  }

  const token = await deezerToken(profileId);
  if (!token) throw new Error('Deezer non connecté');
  const resolved = await resolveDeezerTrack(profileId, track);
  const response = await axios.post(
    'https://api.deezer.com/user/me/tracks',
    null,
    { params: { access_token: token, track_id: resolved.id }, timeout: 15000 },
  );
  if (response.data === false || response.data?.error) throw new Error(response.data?.error?.message || 'Échec ajout favoris Deezer');
  return { added: true, providerTrackId: resolved.id };
}

/**
 * Coeur de la synchro automatique pour UN utilisateur : repère les nouveaux
 * favoris sur chaque fournisseur connecté depuis le dernier passage, les
 * marque `pending_review` (jamais visibles tant que l'utilisateur n'a pas
 * décidé dans Mes Sessions), et -- si l'autre fournisseur est aussi connecté
 * et autorise l'écriture -- le réplique là-bas aussi, dédupliqué par
 * `track_id` canonique pour ne jamais créer de doublon.
 */
export async function syncFavoritesForProfile(profileId: string) {
  const database = db();
  const [spotifyConn, deezerConn] = await Promise.all([
    connection(profileId, 'spotify'),
    connection(profileId, 'deezer'),
  ]);
  const connections: Array<{ provider: Provider; conn: any }> = [];
  if (spotifyConn?.access_token) connections.push({ provider: 'spotify', conn: spotifyConn });
  if (deezerConn?.access_token) connections.push({ provider: 'deezer', conn: deezerConn });
  if (!connections.length) return { profileId, checked: 0, newLikes: 0, crossWritten: 0, errors: [] as string[] };

  let newLikes = 0;
  let crossWritten = 0;
  const errors: string[] = [];

  for (const { provider } of connections) {
    try {
      const remoteTracks = await getConnectedSavedTracks(profileId, provider);
      if (!remoteTracks.length) continue;

      const { data: knownRows } = await database
        .from('music_library_items')
        .select('provider_track_id')
        .eq('profile_id', profileId)
        .eq('provider', provider)
        .eq('source_kind', 'saved');
      const known = new Set((knownRows ?? []).map((r: any) => r.provider_track_id));
      const freshTracks = remoteTracks.filter((t) => !known.has(t.id));
      if (!freshTracks.length) continue;

      const now = new Date().toISOString();
      for (const track of freshTracks) {
        const trackId = await resolveCanonicalTrackId(track);

        const { error: insertError } = await database.from('music_library_items').upsert({
          profile_id: profileId,
          provider,
          provider_track_id: track.id,
          track_id: trackId,
          provider_uri: track.uri || null,
          isrc: track.isrc || null,
          title: track.title,
          artist: track.artist,
          album: track.album || null,
          artwork_url: track.artworkUrl || null,
          source_kind: 'saved',
          pending_review: true,
          last_seen_at: now,
          metadata: { externalUrl: track.externalUrl || null, autoSync: true },
        }, { onConflict: 'profile_id,provider,provider_track_id' });
        if (insertError) { errors.push(`${provider}:${track.id}:${insertError.message}`); continue; }
        newLikes += 1;

        const other = connections.find((c) => c.provider !== provider);
        if (!other || !trackId) continue;
        if (!hasWriteScope(other.provider, other.conn.scope)) continue;

        const { data: alreadyThere } = await database
          .from('music_library_items')
          .select('id')
          .eq('profile_id', profileId)
          .eq('provider', other.provider)
          .eq('track_id', trackId)
          .maybeSingle();
        if (alreadyThere) continue;

        try {
          const result = await addTrackToFavorites(profileId, other.provider, { isrc: track.isrc, title: track.title, artist: track.artist });
          await database.from('music_library_items').upsert({
            profile_id: profileId,
            provider: other.provider,
            provider_track_id: result.providerTrackId || `mirror-${track.id}`,
            track_id: trackId,
            isrc: track.isrc || null,
            title: track.title,
            artist: track.artist,
            album: track.album || null,
            artwork_url: track.artworkUrl || null,
            source_kind: 'saved',
            // Le morceau d'origine porte déjà la décision "pending_review" --
            // ce miroir ne doit pas produire une deuxième proposition de
            // session pour le même morceau.
            pending_review: false,
            last_seen_at: now,
            metadata: { mirroredFrom: provider, autoSync: true },
          }, { onConflict: 'profile_id,provider,provider_track_id' });
          crossWritten += 1;
        } catch (crossError: any) {
          errors.push(`cross:${other.provider}:${track.id}:${String(crossError?.message || crossError)}`);
        }
      }
    } catch (providerError: any) {
      errors.push(`${provider}:${String(providerError?.message || providerError)}`);
    }
  }

  return { profileId, checked: connections.length, newLikes, crossWritten, errors: errors.slice(0, 10) };
}

/** Point d'entrée appelé par le worker cron (pg_cron -> ce backend, toutes les 30 min). */
export async function syncFavoritesForAllConnectedProfiles(limit = 25) {
  const database = db();
  const { data: rows, error } = await database
    .from('music_provider_connections')
    .select('profile_id')
    .in('provider', ['spotify', 'deezer']);
  if (error) throw error;
  const profileIds = Array.from(new Set((rows ?? []).map((r: any) => r.profile_id))).slice(0, Math.max(1, Math.min(limit, 100)));

  const results: any[] = [];
  for (const profileId of profileIds) {
    try { results.push(await syncFavoritesForProfile(profileId)); }
    catch (error: any) { results.push({ profileId, error: String(error?.message || error) }); }
  }
  return { processed: results.length, results };
}

/**
 * Lu par le mobile pour matérialiser les nouveaux favoris détectés en
 * session Loki ("Mes Sessions") -- même geste GARDER/PASSER qu'un morceau
 * détecté au micro, jamais publié tout seul. Dédoublonne défensivement par
 * morceau canonique avant de "réclamer" (session_queued_at) les lignes,
 * pour ne jamais proposer deux fois la même chanson si elle a été likée sur
 * les deux plateformes à quelques minutes d'écart.
 */
export async function listPendingSessionImports(profileId: string) {
  const database = db();
  const { data: rows, error } = await database
    .from('music_library_items')
    .select('id,provider,track_id,isrc,title,artist,album,artwork_url,imported_at')
    .eq('profile_id', profileId)
    .eq('pending_review', true)
    .is('session_queued_at', null)
    .order('imported_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  const items = rows ?? [];
  if (!items.length) return [];

  const seen = new Set<string>();
  const output: any[] = [];
  const idsToClaim: string[] = [];
  for (const row of items) {
    idsToClaim.push(row.id);
    const key = row.track_id || row.isrc || `${String(row.title).toLowerCase()}|${String(row.artist).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }

  await database.from('music_library_items').update({ session_queued_at: new Date().toISOString() }).in('id', idsToClaim);
  return output;
}
