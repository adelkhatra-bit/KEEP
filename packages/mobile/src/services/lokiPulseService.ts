import type { CanonicalTrack } from '@keep/music';
import { coalesced } from './coalesce';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { mergeTasteRecommendations } from './tasteMerge';
export { mergeTasteRecommendations } from './tasteMerge';

export type LokiPulseItem = {
  track: CanonicalTrack;
  relevanceScore: number;
  isNew: boolean;
};

const PULSE_CACHE_PREFIX = 'keep:loki-pulse:last-good:v1:';
const pulseMemoryCache = new Map<string, LokiPulseItem[]>();

function pulseCacheKey(profileId: string): string {
  return `${PULSE_CACHE_PREFIX}${profileId}`;
}

function normalizeCachedPulse(value: unknown): LokiPulseItem[] {
  return (Array.isArray(value) ? value : []).flatMap((item: any): LokiPulseItem[] => {
    const track = item?.track;
    const id = String(track?.id ?? '').trim();
    const title = String(track?.title ?? '').trim();
    const artist = String(track?.artist ?? '').trim();
    if (!id || !title || !artist) return [];
    return [{
      track: {
        ...track,
        id,
        title,
        artist,
        genres: Array.isArray(track?.genres) ? track.genres.map(String) : [],
        providerIds: track?.providerIds && typeof track.providerIds === 'object' ? track.providerIds : {},
        externalUrls: track?.externalUrls && typeof track.externalUrls === 'object' ? track.externalUrls : {},
        availableOn: Array.isArray(track?.availableOn) ? track.availableOn.map(String) : [],
      },
      relevanceScore: Number(item?.relevanceScore ?? 0),
      isNew: Boolean(item?.isNew),
    }];
  });
}

async function readPulseCache(profileId: string, limit: number): Promise<LokiPulseItem[]> {
  const memory = pulseMemoryCache.get(profileId);
  if (memory?.length) return memory.slice(0, limit);
  try {
    const raw = await AsyncStorage.getItem(pulseCacheKey(profileId));
    const parsed = raw ? normalizeCachedPulse(JSON.parse(raw)) : [];
    if (parsed.length) pulseMemoryCache.set(profileId, parsed);
    return parsed.slice(0, limit);
  } catch {
    return [];
  }
}

async function writePulseCache(profileId: string, items: LokiPulseItem[]): Promise<void> {
  if (!items.length) return;
  const stable = items.slice(0, 60);
  pulseMemoryCache.set(profileId, stable);
  try {
    await AsyncStorage.setItem(pulseCacheKey(profileId), JSON.stringify(stable));
  } catch {
    // Le cache mémoire suffit pour la session ; une panne de stockage local
    // ne doit jamais faire échouer Loki Pulse.
  }
}

function normalizePulseRows(data: unknown): LokiPulseItem[] {
  return (Array.isArray(data) ? data : []).flatMap((row: any): LokiPulseItem[] => {
    const id = String(row?.track_id ?? '').trim();
    const title = String(row?.title ?? '').trim();
    const artist = String(row?.artist ?? '').trim();
    if (!id || !title || !artist) return [];
    return [{
      track: {
        id,
        title,
        artist,
        album: row?.album ? String(row.album) : undefined,
        artworkUrl: row?.artwork_url ? String(row.artwork_url) : undefined,
        previewUrl: row?.preview_url ? String(row.preview_url) : undefined,
        genres: Array.isArray(row?.genres) ? row.genres.map(String) : [],
        providerIds: row?.provider_ids && typeof row.provider_ids === 'object' ? row.provider_ids : {},
        externalUrls: row?.external_urls && typeof row.external_urls === 'object' ? row.external_urls : {},
        availableOn: Array.isArray(row?.available_on) ? row.available_on.map(String) : [],
      },
      relevanceScore: Number(row?.relevance_score ?? 0),
      isNew: Boolean(row?.is_new),
    }];
  });
}

export async function requestLokiPulseCatalogExpansion(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('keep-pulse-catalog-expand', { body: {} });
  if (error) throw error;
}

/**
 * Recommandations automatiques par le GOÛT (Adel 05/10/2026, « machine de guerre ») : le serveur (keep_recommend_for_me) croise mes GARDER, ❤ / 😐 / 👎, mes partages
 * et mes abonnements pour proposer des musiques à mon style ; elles passent en tête du Pulse. Additif : en cas d'erreur, le Pulse reste celui d'avant.
 */
export async function loadTasteRecommendations(limit = 12): Promise<LokiPulseItem[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('keep_recommend_for_me', { p_limit: Math.max(1, Math.min(limit, 30)) });
    if (error) return [];
    return normalizePulseRows((Array.isArray(data) ? data : []).map((row: any) => ({ ...row, relevance_score: row?.score, is_new: false })));
  } catch {
    return [];
  }
}

async function loadLokiPulseUncoalesced(limit = 36, profileId?: string): Promise<LokiPulseItem[]> {
  if (!supabase) return [];
  const safeLimit = Math.max(4, Math.min(limit, 60));
  const cached = profileId ? await readPulseCache(profileId, safeLimit) : [];

  let first: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    first = await supabase.rpc('keep_loki_pulse', { p_limit: safeLimit });
  } catch (error) {
    if (cached.length) return cached;
    throw error;
  }
  if (first.error) {
    if (cached.length) return cached;
    throw first.error;
  }
  const initialItems = normalizePulseRows(first.data);

  // A thin Pulse should self-heal from the user's declared/inferred tastes.
  // Expansion is bounded server-side (cooldown + daily cap) and stores only
  // public catalog metadata/previews, never full copyrighted audio files.
  if (initialItems.length < Math.min(18, safeLimit)) {
    try {
      await requestLokiPulseCatalogExpansion();
      const retry = await supabase.rpc('keep_loki_pulse', { p_limit: safeLimit });
      if (!retry.error) {
        const refreshed = mergeTasteRecommendations(normalizePulseRows(retry.data), await loadTasteRecommendations(), safeLimit);
        if (refreshed.length) {
          if (profileId) await writePulseCache(profileId, refreshed);
          return refreshed;
        }
      }
    } catch {
      // Provider expansion is additive; a temporary provider failure must not
      // make an already-valid Pulse disappear.
    }
  } else {
    void requestLokiPulseCatalogExpansion().catch(() => {});
  }
  const personalized = mergeTasteRecommendations(initialItems, await loadTasteRecommendations(), safeLimit);
  if (profileId && personalized.length) await writePulseCache(profileId, personalized);
  return personalized.length ? personalized : cached;
}

export function loadLokiPulse(limit = 36, profileId?: string): Promise<LokiPulseItem[]> {
  return coalesced('loadLokiPulse' + ':' + String(limit) + ':' + String(profileId), () => loadLokiPulseUncoalesced(limit, profileId));
}


export async function hideLokiPulseTrack(trackId: string): Promise<void> {
  if (!supabase || !trackId) return;
  const { error } = await supabase.rpc('keep_loki_pulse_hide', { p_track_id: trackId });
  if (error) throw error;
}

export async function markLokiPulseTrackKept(trackId: string): Promise<void> {
  if (!supabase || !trackId) return;
  const { error } = await supabase.rpc('keep_loki_pulse_mark_kept', { p_track_id: trackId });
  if (error) throw error;
}
