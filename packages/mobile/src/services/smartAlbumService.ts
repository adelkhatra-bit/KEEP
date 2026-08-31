import { buildSmartAlbumSuggestions, type CanonicalTrack, type ProviderPlaylist } from '@keep/music';
import { supabase } from './supabaseClient';
import { enrichMissingGenres } from './keylessGenreService';
import { APP_NAME } from '../config/brand';

export type SmartAlbumConfig = {
  enabled: boolean;
  autoCreate: boolean;
  minTracks: number;
  maxAlbums: number;
  allowRename: boolean;
  taxonomyVersion: number;
};

export type SmartAlbumRecord = {
  id: string;
  smartKey: string;
  name: string;
  description: string;
  isPublic: boolean;
  trackCount: number;
  matchedGenres: string[];
};

export const SMART_ALBUM_UI_PREFIX = 'keep-smart:';

const DEFAULT_CONFIG: SmartAlbumConfig = {
  enabled: true,
  autoCreate: true,
  minTracks: 2,
  maxAlbums: 10,
  allowRename: true,
  taxonomyVersion: 1,
};

function parseConfig(value: any): SmartAlbumConfig {
  return {
    enabled: value?.enabled !== false,
    autoCreate: value?.auto_create !== false,
    minTracks: Math.max(1, Number(value?.min_tracks ?? DEFAULT_CONFIG.minTracks) || DEFAULT_CONFIG.minTracks),
    maxAlbums: Math.max(1, Number(value?.max_albums ?? DEFAULT_CONFIG.maxAlbums) || DEFAULT_CONFIG.maxAlbums),
    allowRename: value?.allow_rename !== false,
    taxonomyVersion: Math.max(1, Number(value?.taxonomy_version ?? 1) || 1),
  };
}

export function smartAlbumUiId(databaseId: string) {
  return `${SMART_ALBUM_UI_PREFIX}${databaseId}`;
}

export function isSmartAlbumUiId(value?: string | null) {
  return Boolean(value?.startsWith(SMART_ALBUM_UI_PREFIX));
}

export function smartAlbumDatabaseId(value: string) {
  return value.startsWith(SMART_ALBUM_UI_PREFIX) ? value.slice(SMART_ALBUM_UI_PREFIX.length) : value;
}

export function smartAlbumAsProviderPlaylist(album: SmartAlbumRecord): ProviderPlaylist {
  return {
    id: smartAlbumUiId(album.id),
    name: album.name,
    description: album.description,
    trackCount: album.trackCount,
    isKeepManaged: true,
  };
}

export async function loadSmartAlbumConfig(): Promise<SmartAlbumConfig> {
  if (!supabase) return DEFAULT_CONFIG;
  const { data } = await supabase.from('remote_config').select('value').eq('key', 'smart_album_config').maybeSingle();
  return parseConfig(data?.value);
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function smartExternalId(key: string) {
  return `smart:${key}`;
}

export async function loadOwnSmartAlbums(): Promise<SmartAlbumRecord[]> {
  if (!supabase) return [];
  const userId = await currentUserId();
  if (!userId) return [];

  const { data: playlists, error } = await supabase
    .from('playlists')
    .select('id,provider_playlist_id,name,description,is_public')
    .eq('owner_id', userId)
    .eq('provider', 'KEEP_SMART')
    .eq('is_smart', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const ids = (playlists ?? []).map((row: any) => String(row.id));
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: memberships, error: membershipError } = await supabase
      .from('playlist_tracks')
      .select('playlist_id')
      .in('playlist_id', ids);
    if (membershipError) throw membershipError;
    for (const row of memberships ?? []) {
      const id = String((row as any).playlist_id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return (playlists ?? []).map((row: any) => ({
    id: String(row.id),
    smartKey: String(row.provider_playlist_id ?? '').replace(/^smart:/, ''),
    name: String(row.name ?? 'Vibe Loki'),
    description: String(row.description ?? ''),
    isPublic: Boolean(row.is_public),
    trackCount: counts.get(String(row.id)) ?? 0,
    matchedGenres: [],
  }));
}

export async function loadSmartAlbumTracks(uiOrDatabaseId: string): Promise<CanonicalTrack[]> {
  if (!supabase) return [];
  const userId = await currentUserId();
  if (!userId) return [];
  const databaseId = smartAlbumDatabaseId(uiOrDatabaseId);

  const { data: playlist, error: playlistError } = await supabase
    .from('playlists')
    .select('id')
    .eq('id', databaseId)
    .eq('owner_id', userId)
    .eq('provider', 'KEEP_SMART')
    .eq('is_smart', true)
    .maybeSingle();
  if (playlistError) throw playlistError;
  if (!playlist) return [];

  const { data, error } = await supabase
    .from('playlist_tracks')
    .select('added_at,tracks!inner(id,isrc,title,artist,album,duration_sec,artwork_url,genres,provider_ids,preview_url,available_on,external_urls)')
    .eq('playlist_id', databaseId)
    .order('added_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const track = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks;
    return {
      id: String(track.id),
      isrc: track.isrc ? String(track.isrc) : undefined,
      title: String(track.title ?? ''),
      artist: String(track.artist ?? ''),
      album: track.album ? String(track.album) : undefined,
      durationSec: track.duration_sec == null ? undefined : Number(track.duration_sec),
      artworkUrl: track.artwork_url ? String(track.artwork_url) : undefined,
      genres: Array.isArray(track.genres) ? track.genres.map(String) : [],
      providerIds: track.provider_ids && typeof track.provider_ids === 'object' ? track.provider_ids : {},
      previewUrl: track.preview_url ? String(track.preview_url) : undefined,
      availableOn: Array.isArray(track.available_on) ? track.available_on.map(String) : [],
      externalUrls: track.external_urls && typeof track.external_urls === 'object' ? track.external_urls : {},
    } satisfies CanonicalTrack;
  });
}

export async function refreshOwnSmartAlbums(): Promise<SmartAlbumRecord[]> {
  if (!supabase) return [];
  const userId = await currentUserId();
  if (!userId) return [];

  const config = await loadSmartAlbumConfig();
  if (!config.enabled || !config.autoCreate) return loadOwnSmartAlbums();

  const { data: rows, error: keepError } = await supabase
    .from('keep_decisions')
    .select('track_id,tracks!inner(id,title,artist,album,genres,artwork_url)')
    .eq('profile_id', userId)
    .eq('decision', 'KEPT');
  if (keepError) throw keepError;

  const unique = new Map<string, { id: string; title: string; artist: string; genres: string[] }>();
  for (const row of (rows ?? []) as any[]) {
    const joined = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks;
    if (!joined?.id) continue;
    unique.set(String(joined.id), {
      id: String(joined.id),
      title: String(joined.title ?? ''),
      artist: String(joined.artist ?? ''),
      genres: Array.isArray(joined.genres) ? joined.genres.map(String).filter(Boolean) : [],
    });
  }

  // Les anciens morceaux de la base n'avaient pas de genre. Loki les enrichit
  // lui-même, sans clé ni abonnement API, via le même catalogue public gratuit
  // déjà utilisé pour les jaquettes. Le résultat est mis en cache 30 jours.
  const enrichedTracks = await enrichMissingGenres(Array.from(unique.values()));
  const suggestions = buildSmartAlbumSuggestions(enrichedTracks, {
    minTracks: config.minTracks,
    maxAlbums: config.maxAlbums,
  });

  const { data: existingRows, error: existingError } = await supabase
    .from('playlists')
    .select('id,provider_playlist_id,name,description,is_public')
    .eq('owner_id', userId)
    .eq('provider', 'KEEP_SMART')
    .eq('is_smart', true);
  if (existingError) throw existingError;

  const existing = new Map<string, any>();
  for (const row of existingRows ?? []) existing.set(String((row as any).provider_playlist_id ?? ''), row);

  const result: SmartAlbumRecord[] = [];
  for (const suggestion of suggestions) {
    const externalId = smartExternalId(suggestion.key);
    const previous = existing.get(externalId);
    let playlistId = previous?.id ? String(previous.id) : '';
    let name = previous?.name ? String(previous.name) : suggestion.name;
    let isPublic = Boolean(previous?.is_public);

    if (!playlistId) {
      const { data: created, error: createError } = await supabase.from('playlists').insert({
        owner_id: userId,
        provider: 'KEEP_SMART',
        provider_playlist_id: externalId,
        name: suggestion.name,
        description: suggestion.description,
        is_public: false,
        is_smart: true,
        cover_url: null,
      }).select('id,name,is_public').single();
      if (createError) throw createError;
      playlistId = String(created.id);
      name = String(created.name ?? suggestion.name);
      isPublic = Boolean(created.is_public);
    } else {
      const { error: updateError } = await supabase.from('playlists').update({
        description: suggestion.description,
        is_smart: true,
        updated_at: new Date().toISOString(),
      }).eq('id', playlistId).eq('owner_id', userId);
      if (updateError) throw updateError;
    }

    const { error: clearError } = await supabase.from('playlist_tracks').delete().eq('playlist_id', playlistId);
    if (clearError) throw clearError;
    if (suggestion.trackIds.length) {
      const { error: insertError } = await supabase.from('playlist_tracks').insert(
        suggestion.trackIds.map((trackId) => ({ playlist_id: playlistId, track_id: trackId, added_via: 'KEEP' })),
      );
      if (insertError) throw insertError;
    }

    result.push({
      id: playlistId,
      smartKey: suggestion.key,
      name,
      description: suggestion.description,
      isPublic,
      trackCount: suggestion.trackCount,
      matchedGenres: suggestion.matchedGenres,
    });
  }

  // Si une Vibe ne correspond plus au seuil (morceaux retirés/changement de
  // classement), on conserve son nom personnalisé mais jamais ses anciens
  // morceaux : l'utilisateur ne voit donc aucune collection périmée.
  const freshIds = new Set(result.map((album) => album.id));
  for (const row of existingRows ?? []) {
    const id = String((row as any).id);
    if (freshIds.has(id)) continue;
    const { error: staleError } = await supabase.from('playlist_tracks').delete().eq('playlist_id', id);
    if (staleError) throw staleError;
  }

  return result;
}

export async function renameOwnSmartAlbum(id: string, name: string): Promise<void> {
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const userId = await currentUserId();
  if (!userId) throw new Error('Connecte-toi pour renommer cette Vibe.');
  const next = name.trim();
  if (next.length < 2) throw new Error('Le nom doit contenir au moins 2 caractères.');
  const { error } = await supabase.from('playlists').update({ name: next, updated_at: new Date().toISOString() })
    .eq('id', smartAlbumDatabaseId(id)).eq('owner_id', userId).eq('provider', 'KEEP_SMART').eq('is_smart', true);
  if (error) throw error;
}

export async function setOwnSmartAlbumPublic(id: string, isPublic: boolean): Promise<void> {
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const userId = await currentUserId();
  if (!userId) throw new Error('Connecte-toi pour modifier cette Vibe.');
  const { error } = await supabase.from('playlists').update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', smartAlbumDatabaseId(id)).eq('owner_id', userId).eq('provider', 'KEEP_SMART').eq('is_smart', true);
  if (error) throw error;
}
