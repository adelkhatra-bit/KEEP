import { supabase } from './supabaseClient';
import { likeKey } from './trackLikeKey';

/**
 * Le cœur « j'aime » partout (Adel, 05/10/2026, IDEA-106/107) : UNE seule table, `track_likes` (profile_id, track_id), déjà lue par l'algorithme
 * (affinités musicales, notifications boutique) et par le profil d'un membre. Les musiques EN VENTE d'une story portent l'identifiant « sale:<id> » : on enregistre l'id réel.
 */
export { likeKey } from './trackLikeKey';

/** Mes « j'aime » parmi ces musiques (clés = ids réels). */
export async function loadMyLikesAmong(profileId: string, trackIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = Array.from(new Set(trackIds.map(likeKey).filter(Boolean))).slice(0, 80);
  if (!supabase || !profileId || !ids.length) return out;
  const { data, error } = await supabase.from('track_likes').select('track_id').eq('profile_id', profileId).in('track_id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) if (row?.track_id) out.add(String(row.track_id));
  return out;
}

/** Nombre de personnes qui ont aimé chaque musique (lecture publique, comme sur le profil). */
export async function loadLikeCounts(trackIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ids = Array.from(new Set(trackIds.map(likeKey).filter(Boolean))).slice(0, 80);
  if (!supabase || !ids.length) return out;
  const { data, error } = await supabase.from('track_likes').select('track_id').in('track_id', ids).limit(5000);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) if (row?.track_id) out[String(row.track_id)] = (out[String(row.track_id)] ?? 0) + 1;
  return out;
}

/** Ajoute (liked = true) ou retire mon j'aime ; lève l'erreur pour permettre le retour en arrière à l'écran. */
export async function setTrackLike(profileId: string, trackId: string, liked: boolean): Promise<void> {
  const key = likeKey(trackId);
  if (!supabase || !profileId || !key) throw new Error('TRACK_LIKE_UNAVAILABLE');
  if (liked) {
    const { error } = await supabase.from('track_likes').upsert({ profile_id: profileId, track_id: key }, { onConflict: 'profile_id,track_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('track_likes').delete().eq('profile_id', profileId).eq('track_id', key);
    if (error) throw error;
  }
}
