import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import type { KeepVisibility } from '../types';
import { APP_NAME } from '../config/brand';
import { isSmartAlbumUiId, smartAlbumDatabaseId, smartAlbumUiId } from './smartAlbumService';

const LOCAL_KEY_PREFIX = '@keep/playlist-preferences-v2';

export type KeepPlaylistPreference = {
  provider: string;
  providerPlaylistId: string;
  name: string;
  description: string;
  isPublic: boolean;
  coverUrl?: string;
};

type PreferenceMap = Record<string, KeepPlaylistPreference>;

function mapKey(provider: string, providerPlaylistId: string) {
  return `${provider}:${providerPlaylistId}`;
}

function storageKey(userId?: string | null) {
  return `${LOCAL_KEY_PREFIX}:${userId || 'guest'}`;
}

async function readLocal(userId?: string | null): Promise<PreferenceMap> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) as PreferenceMap : {};
  } catch {
    return {};
  }
}

async function writeLocal(userId: string | null | undefined, map: PreferenceMap) {
  try { await AsyncStorage.setItem(storageKey(userId), JSON.stringify(map)); } catch {}
}

export async function loadPlaylistPreferences(provider: string): Promise<PreferenceMap> {
  if (!supabase) return readLocal(null);

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;
  const local = await readLocal(userId);
  if (!userId) return local;

  const { data, error } = await supabase
    .from('playlists')
    .select('id,provider,provider_playlist_id,name,description,is_public,cover_url,is_smart')
    .eq('owner_id', userId)
    .in('provider', [provider, 'KEEP_SMART']);
  if (error) return local;

  const merged = { ...local };
  for (const row of data ?? []) {
    const isSmart = String(row.provider) === 'KEEP_SMART' && Boolean(row.is_smart);
    const providerPlaylistId = isSmart
      ? smartAlbumUiId(String(row.id))
      : row.provider_playlist_id ? String(row.provider_playlist_id) : '';
    if (!providerPlaylistId) continue;
    const preference: KeepPlaylistPreference = {
      provider,
      providerPlaylistId,
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      isPublic: Boolean(row.is_public),
      coverUrl: row.cover_url ? String(row.cover_url) : undefined,
    };
    merged[mapKey(provider, providerPlaylistId)] = preference;
  }
  await writeLocal(userId, merged);
  return merged;
}

export async function savePlaylistPreference(preference: KeepPlaylistPreference): Promise<void> {
  let userId: string | null = null;
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    userId = sessionData.session?.user?.id ?? null;
  }

  const local = await readLocal(userId);
  local[mapKey(preference.provider, preference.providerPlaylistId)] = preference;
  await writeLocal(userId, local);

  if (!supabase || !userId) return;

  if (isSmartAlbumUiId(preference.providerPlaylistId)) {
    const databaseId = smartAlbumDatabaseId(preference.providerPlaylistId);
    const { error } = await supabase.from('playlists').update({
      name: preference.name.trim() || 'Album Loki',
      description: preference.description.trim() || null,
      is_public: preference.isPublic,
      updated_at: new Date().toISOString(),
    })
      .eq('id', databaseId)
      .eq('owner_id', userId)
      .eq('provider', 'KEEP_SMART')
      .eq('is_smart', true);
    if (error) throw error;
    return;
  }

  const { data: existing, error: findError } = await supabase
    .from('playlists')
    .select('id')
    .eq('owner_id', userId)
    .eq('provider', preference.provider)
    .eq('provider_playlist_id', preference.providerPlaylistId)
    .limit(1);
  if (findError) throw findError;

  const payload = {
    owner_id: userId,
    provider: preference.provider,
    provider_playlist_id: preference.providerPlaylistId,
    name: preference.name.trim() || 'Mes KEEP',
    description: preference.description.trim() || null,
    is_public: preference.isPublic,
    cover_url: preference.coverUrl || null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.[0]?.id) {
    const { error } = await supabase.from('playlists').update(payload).eq('id', existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('playlists').insert({ ...payload, is_smart: false });
    if (error) throw error;
  }
}

export async function setAllOwnKeepVisibility(visibility: KeepVisibility): Promise<number> {
  if (!supabase) throw new Error(`${APP_NAME} n’est pas connecté au serveur.`);
  const { data, error } = await supabase.rpc('keep_set_all_keep_visibility', { p_visibility: visibility });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function syncPlaylistTrack(params: {
  provider: string;
  providerPlaylistId: string;
  playlistName: string;
  playlistDescription?: string;
  coverUrl?: string;
  trackId: string;
  addedVia?: 'KEEP' | 'SOCIAL';
}): Promise<void> {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const keyProvider = params.provider || 'KEEP';
  const normalizedPlaylistName = params.playlistName.trim().toLowerCase();
  const providerPlaylistId = keyProvider === 'demo' && normalizedPlaylistName === 'mes keep'
    ? 'keep-local-history'
    : params.providerPlaylistId;

  const { data: rows, error: findError } = await supabase
    .from('playlists')
    .select('id,is_public,name,description')
    .eq('owner_id', userId)
    .eq('provider', keyProvider)
    .eq('provider_playlist_id', providerPlaylistId)
    .limit(1);
  if (findError) throw findError;

  let playlistId = rows?.[0]?.id as string | undefined;
  if (!playlistId) {
    const { data: created, error } = await supabase.from('playlists').insert({
      owner_id: userId,
      provider: keyProvider,
      provider_playlist_id: providerPlaylistId,
      name: params.playlistName || 'Mes KEEP',
      description: params.playlistDescription || 'Morceaux gardés avec Loki.',
      is_public: false,
      is_smart: false,
      cover_url: params.coverUrl || null,
    }).select('id').single();
    if (error) throw error;
    playlistId = String(created.id);
  }

  const { error: membershipError } = await supabase.from('playlist_tracks').upsert({
    playlist_id: playlistId,
    track_id: params.trackId,
    added_via: params.addedVia ?? 'KEEP',
  }, { onConflict: 'playlist_id,track_id', ignoreDuplicates: false });
  if (membershipError) throw membershipError;
}

export function preferenceFor(map: PreferenceMap, provider: string, providerPlaylistId: string) {
  return map[mapKey(provider, providerPlaylistId)] ?? null;
}
