import type { CanonicalTrack } from '@keep/music';
import { supabase } from './supabaseClient';

export type LokiPulseItem = {
  track: CanonicalTrack;
  relevanceScore: number;
  isNew: boolean;
};

export async function loadLokiPulse(limit = 14): Promise<LokiPulseItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_loki_pulse', { p_limit: Math.max(4, Math.min(limit, 30)) });
  if (error) throw error;
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
