import { supabase } from './supabaseClient';

/** J'aime sur les stories (Adel, 05/10/2026) : un cœur par spectateur et par musique ; le propriétaire voit le nombre de « j'aime » par musique. */

/** Bascule mon « j'aime » sur une musique de la story d'un membre ; renvoie l'état final (true = aimé). Lève l'erreur pour permettre le retour en arrière. */
export async function toggleStoryLike(ownerId: string, trackId: string): Promise<boolean> {
  if (!supabase || !ownerId || !trackId) throw new Error('STORY_LIKE_UNAVAILABLE');
  const { data, error } = await supabase.rpc('keep_story_like_toggle', { p_owner_id: ownerId, p_track_id: trackId });
  if (error) throw error;
  return Boolean(data);
}

/** Les musiques de sa story que j'ai déjà aimées (état du cœur à l'ouverture). */
export async function loadMyLikesOn(ownerId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase || !ownerId) return out;
  const { data, error } = await supabase.rpc('keep_story_likes_mine', { p_owner_id: ownerId });
  if (error) throw error;
  for (const row of (Array.isArray(data) ? data : []) as any[]) if (row?.track_id) out.add(String(row.track_id));
  return out;
}

/** Ma story : nombre de « j'aime » par musique (réservé au propriétaire). */
export async function loadMyStoryLikeCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!supabase) return out;
  const { data, error } = await supabase.rpc('keep_my_story_like_counts');
  if (error) throw error;
  for (const row of (Array.isArray(data) ? data : []) as any[]) if (row?.track_id) out[String(row.track_id)] = Number(row.likes) || 0;
  return out;
}
