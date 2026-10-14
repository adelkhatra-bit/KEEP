import { supabase } from './supabaseClient';

export type PulseSimilarProfile = {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  sharedStyle: string;
  matchScore: number;
};

/**
 * Loki Pulse reuses the server's canonical style taxonomy to recommend REAL
 * public members matching a listener's declared and learned music tastes.
 * Auth and visibility are checked server-side; never query private profiles
 * directly or invent demo people on empty/offline results.
 */
export async function loadPulseSimilarProfiles(limit = 8): Promise<PulseSimilarProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('keep_pulse_similar_profiles', {
    p_limit: Math.max(1, Math.min(Math.floor(limit), 20)),
  });
  if (error) throw error;
  const seen = new Set<string>();
  return (Array.isArray(data) ? data : []).flatMap((row: any): PulseSimilarProfile[] => {
    const profileId = String(row?.profile_id ?? '').trim();
    const username = String(row?.username ?? '').trim();
    if (!profileId || !username || seen.has(profileId)) return [];
    seen.add(profileId);
    return [{
      profileId,
      username,
      avatarUrl: row?.avatar_url ? String(row.avatar_url) : null,
      sharedStyle: String(row?.shared_style ?? 'Musique').trim() || 'Musique',
      matchScore: Math.max(0, Math.min(100, Number(row?.match_score) || 0)),
    }];
  });
}
