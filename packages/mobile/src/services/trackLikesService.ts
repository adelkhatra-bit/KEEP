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

/**
 * Ajoute mon j'aime ; lève l'erreur pour permettre le retour en arrière à l'écran.
 * Un j'aime posé depuis un lecteur n'est pas retiré d'ici (donnée de goût protégée : aucune suppression côté lecteur) ; le retrait existe sur le profil d'un membre.
 */
export async function addTrackLike(profileId: string, trackId: string): Promise<void> {
  const key = likeKey(trackId);
  if (!supabase || !profileId || !key) throw new Error('TRACK_LIKE_UNAVAILABLE');
  const { error } = await supabase.from('track_likes').upsert({ profile_id: profileId, track_id: key }, { onConflict: 'profile_id,track_id', ignoreDuplicates: true });
  if (error) throw error;
}

export type NegativeReaction = 'DISLIKE' | 'MEH';

/** « Pas aimé » ou « Bof » : ajout seulement (aucune suppression depuis un lecteur) ; table `track_dislikes` (colonne `reaction`), visible par son auteur ; le partageur ne reçoit que des compteurs. */
export async function addTrackNegative(profileId: string, trackId: string, reaction: NegativeReaction): Promise<void> {
  const key = likeKey(trackId);
  if (!supabase || !profileId || !key) throw new Error('TRACK_REACTION_UNAVAILABLE');
  const { error } = await supabase.from('track_dislikes').upsert({ profile_id: profileId, track_id: key, reaction }, { onConflict: 'profile_id,track_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function loadMyNegativesAmong(profileId: string, trackIds: string[]): Promise<{ disliked: Set<string>; meh: Set<string> }> {
  const out = { disliked: new Set<string>(), meh: new Set<string>() };
  const ids = Array.from(new Set(trackIds.map(likeKey).filter(Boolean))).slice(0, 80);
  if (!supabase || !profileId || !ids.length) return out;
  const { data, error } = await supabase.from('track_dislikes').select('track_id,reaction').eq('profile_id', profileId).in('track_id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) {
    if (!row?.track_id) continue;
    (String(row.reaction) === 'MEH' ? out.meh : out.disliked).add(String(row.track_id));
  }
  return out;
}

/** Nombre de « pas aimé » et de « bof » sur MES musiques partagées (compteurs seulement, réservé au partageur). */
export async function loadMyReactionCounts(trackIds: string[]): Promise<{ dislikes: Record<string, number>; mehs: Record<string, number> }> {
  const out = { dislikes: {} as Record<string, number>, mehs: {} as Record<string, number> };
  const ids = Array.from(new Set(trackIds.map(likeKey).filter(Boolean))).slice(0, 80);
  if (!supabase || !ids.length) return out;
  const { data, error } = await supabase.rpc('keep_my_track_reaction_counts', { p_track_ids: ids });
  if (error) throw error;
  for (const row of (data ?? []) as any[]) {
    if (!row?.track_id) continue;
    out.dislikes[String(row.track_id)] = Number(row.dislikes) || 0;
    out.mehs[String(row.track_id)] = Number(row.mehs) || 0;
  }
  return out;
}
