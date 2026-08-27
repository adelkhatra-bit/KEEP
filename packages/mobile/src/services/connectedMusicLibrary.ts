import { CanonicalTrack } from '@keep/music';
import { getSupabaseAccessToken, supabase } from './supabaseClient';

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

function normalize(value: string | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Première vérification gratuite : la bibliothèque KEEP du compte lui-même.
 * Cela évite d'interroger Spotify/Deezer inutilement et permet surtout de dire
 * immédiatement « déjà dans ta playlist » lorsqu'un morceau a déjà été gardé
 * depuis un autre téléphone ou navigateur.
 */
async function checkOwnKeepLibrary(track: CanonicalTrack): Promise<{
  exists: boolean;
  match: { provider: string; playlistId: string; playlistName: string } | null;
} | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const profileId = sessionData.session?.user?.id;
  if (!profileId) return null;

  let trackRows: any[] = [];
  if (track.isrc?.trim()) {
    const { data } = await supabase
      .from('tracks')
      .select('id,isrc,title,artist')
      .eq('isrc', track.isrc.trim().toUpperCase())
      .limit(4);
    trackRows = data ?? [];
  }

  if (!trackRows.length) {
    const { data } = await supabase
      .from('tracks')
      .select('id,isrc,title,artist')
      .ilike('title', track.title.trim())
      .ilike('artist', track.artist.trim())
      .limit(8);
    trackRows = (data ?? []).filter((row: any) =>
      normalize(row.title) === normalize(track.title) && normalize(row.artist) === normalize(track.artist));
  }

  for (const row of trackRows) {
    const { data: keep } = await supabase
      .from('keep_decisions')
      .select('id,context')
      .eq('profile_id', profileId)
      .eq('track_id', row.id)
      .eq('decision', 'KEPT')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!keep) continue;

    const playlist = keep.context?.playlist ?? {};
    return {
      exists: true,
      match: {
        provider: String(playlist.provider || 'KEEP'),
        playlistId: String(playlist.providerPlaylistId || 'keep-profile'),
        playlistName: String(playlist.name || 'Mes KEEP'),
      },
    };
  }

  return { exists: false, match: null };
}

export async function checkConnectedLibraries(track: CanonicalTrack): Promise<{
  exists: boolean;
  match: { provider: string; playlistId: string; playlistName: string } | null;
} | null> {
  const ownKeep = await checkOwnKeepLibrary(track).catch(() => null);
  if (ownKeep?.exists) return ownKeep;

  const base = usableApiUrl();
  const headers = await authHeaders();
  if (!base || !headers) return ownKeep;

  const response = await fetch(`${base}/api/music/library/check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ isrc: track.isrc, title: track.title, artist: track.artist }),
  });

  if (!response.ok) {
    // Une panne d'une plateforme ne doit pas bloquer toute la session KEEP.
    return ownKeep;
  }
  const external = await response.json();
  if (external?.exists) return external;
  return ownKeep ?? external;
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
