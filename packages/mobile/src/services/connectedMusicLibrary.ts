import { CanonicalTrack } from '@keep/music';
import { getSupabaseAccessToken, supabase } from './supabaseClient';
import {
  buildKeepTrackIdentityIndex,
  filterTracksNotAlreadyKept,
  keepProviderIdentities,
  tracksRepresentSameKeep,
} from './keepTrackIdentity';
import { loadOwnProfileKeeps } from './publicProfileStateService';
import { APP_NAME } from '../config/brand';

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

function validUuid(value: string | undefined | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

type LibraryMatch = {
  exists: boolean;
  match: {
    provider: string;
    playlistId: string;
    playlistName: string;
    decisionId?: string;
    trackId?: string;
    visibility?: 'PUBLIC' | 'PRIVATE';
  } | null;
};

export type OwnKeepPrefilterResult = {
  tracks: CanonicalTrack[];
  removedCount: number;
  verified: boolean;
};

function keepMatchFromDecision(row: any): LibraryMatch {
  const playlist = row?.context?.playlist ?? {};
  return {
    exists: true,
    match: {
      provider: String(playlist.provider || 'KEEP'),
      playlistId: String(playlist.providerPlaylistId || 'keep-profile'),
      playlistName: String(playlist.name || 'Mes KEEP'),
      decisionId: row?.id ? String(row.id) : undefined,
      trackId: row?.track_id ? String(row.track_id) : undefined,
      visibility: row?.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
    },
  };
}

async function latestOwnKeep(profileId: string, trackIds: string[]): Promise<LibraryMatch | null> {
  const ids = [...new Set(trackIds.filter(validUuid))];
  if (!ids.length || !supabase) return { exists: false, match: null };
  const { data, error } = await supabase
    .from('keep_decisions')
    .select('id,track_id,visibility,context,created_at')
    .eq('profile_id', profileId)
    .in('track_id', ids)
    .eq('decision', 'KEPT')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? keepMatchFromDecision(data) : { exists: false, match: null };
}

/**
 * Construit la file d'un Swipe social AVANT toute lecture audio.
 * Un seul chargement de la bibliothèque du visiteur suffit : comparaison par
 * UUID Loki, ISRC, identifiants Spotify/Apple/Deezer puis titre/artiste.
 *
 * Si le contrôle distant est indisponible, `verified=false` et on rend la liste
 * d'origine. Le contrôle individuel `checkOwnKeepLibrary` reste alors la
 * deuxième barrière avant GARDER afin qu'aucun doublon ne soit créé.
 */
export async function filterSocialSwipeAgainstOwnKeep(tracks: CanonicalTrack[]): Promise<OwnKeepPrefilterResult> {
  if (!tracks.length || !supabase) return { tracks, removedCount: 0, verified: false };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user?.id) return { tracks, removedCount: 0, verified: false };

  try {
    const ownKeeps = await loadOwnProfileKeeps();
    const index = buildKeepTrackIdentityIndex(ownKeeps.map((entry) => entry.track));
    const filtered = filterTracksNotAlreadyKept(tracks, index);
    return {
      tracks: filtered,
      removedCount: Math.max(0, tracks.length - filtered.length),
      verified: true,
    };
  } catch {
    return { tracks, removedCount: 0, verified: false };
  }
}

/**
 * Vérification gratuite de la bibliothèque Loki du compte lui-même.
 *
 * L'identité d'un morceau n'est jamais limitée au seul `track.id` : selon le
 * chemin (reconnaissance, Swipe, Apple/Spotify, ancien Loki), cet id peut être
 * un UUID Loki OU un identifiant fournisseur. On vérifie donc, dans cet ordre :
 * UUID Loki, identifiants fournisseur, ISRC, puis titre/artiste normalisés.
 *
 * `null` signifie « vérification impossible » et ne doit PAS être interprété
 * comme « morceau absent » par l'UI : on préfère bloquer temporairement GARDER
 * plutôt que fabriquer silencieusement un doublon.
 */
export async function checkOwnKeepLibrary(track: CanonicalTrack): Promise<LibraryMatch | null> {
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return null;
  const profileId = sessionData.session?.user?.id;
  if (!profileId) return null;

  const directTrackId = String(track.id || '').trim();
  if (validUuid(directTrackId)) {
    const direct = await latestOwnKeep(profileId, [directTrackId]);
    if (direct?.exists) return direct;
    if (direct === null) return null;
  }

  const candidates = new Map<string, any>();
  let lookupFailed = false;

  // Cas critique : certains catalogues n'ont pas d'ISRC dans la réponse mais
  // possèdent un identifiant Spotify/Apple stable. C'était le trou principal
  // du blocage de doublons dans le Swipe.
  for (const identity of keepProviderIdentities(track)) {
    const { data, error } = await supabase
      .from('tracks')
      .select('id,isrc,title,artist,provider_ids')
      .contains('provider_ids', { [identity.provider]: identity.value })
      .limit(8);
    if (error) {
      lookupFailed = true;
      continue;
    }
    for (const row of data ?? []) candidates.set(String(row.id), row);
  }

  if (track.isrc?.trim()) {
    const { data, error } = await supabase
      .from('tracks')
      .select('id,isrc,title,artist,provider_ids')
      .eq('isrc', track.isrc.trim().toUpperCase())
      .limit(8);
    if (error) lookupFailed = true;
    else for (const row of data ?? []) candidates.set(String(row.id), row);
  }

  // Dernier filet : métadonnées textuelles. On garde une comparaison locale
  // normalisée pour absorber accents/casse et mentions « Album Version ».
  if (!candidates.size && track.title?.trim() && track.artist?.trim()) {
    const { data, error } = await supabase
      .from('tracks')
      .select('id,isrc,title,artist,provider_ids')
      .ilike('artist', track.artist.trim())
      .limit(30);
    if (error) lookupFailed = true;
    else {
      for (const row of data ?? []) {
        if (tracksRepresentSameKeep(track, {
          id: String(row.id),
          isrc: row.isrc || undefined,
          title: String(row.title || ''),
          artist: String(row.artist || ''),
          providerIds: row.provider_ids && typeof row.provider_ids === 'object' ? row.provider_ids : {},
        })) candidates.set(String(row.id), row);
      }
    }
  }

  if (candidates.size) {
    const ownKeep = await latestOwnKeep(profileId, [...candidates.keys()]);
    if (ownKeep?.exists) return ownKeep;
    if (ownKeep === null) return null;
  }

  return lookupFailed ? null : { exists: false, match: null };
}

export async function checkConnectedLibraries(track: CanonicalTrack): Promise<LibraryMatch | null> {
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
    // Une panne d'une plateforme ne doit pas bloquer toute la session Loki.
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
  if (!base || !headers) throw new Error(`Backend ${APP_NAME} ou session utilisateur non disponible.`);
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
