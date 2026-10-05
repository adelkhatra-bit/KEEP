import { useCallback, useEffect, useRef, useState } from 'react';
import { addTrackLike, addTrackNegative, loadLikeCounts, loadMyNegativesAmong, loadMyLikesAmong, loadMyReactionCounts } from './trackLikesService';
import { likeKey } from './trackLikeKey';

export type TrackReaction = 'LIKE' | 'MEH' | 'DISLIKE';

/**
 * Réactions d'une liste de musiques (Adel 05/10/2026) : aimer / bof / pas aimé, compteurs, ajout optimiste avec retour arrière.
 * Une musique ne reçoit qu'UNE réaction depuis un lecteur : déjà réagi = on garde l'état allumé et on ne redemande pas ; pas de retrait d'ici (donnée de goût protégée).
 */
export function useTrackLikes(profileId: string | null | undefined, trackIds: string[], active: boolean, withOwnerCounts = false) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [disliked, setDisliked] = useState<Set<string>>(new Set());
  const [meh, setMeh] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dislikeCounts, setDislikeCounts] = useState<Record<string, number>>({});
  const [mehCounts, setMehCounts] = useState<Record<string, number>>({});
  const idsKey = trackIds.map(likeKey).join('|');
  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!active || !profileId || !idsKey) return undefined;
    let live = true;
    const ids = idsKey.split('|');
    loadMyLikesAmong(profileId, ids).then((set) => { if (live) setLiked(set); }).catch(() => {});
    loadMyNegativesAmong(profileId, ids).then((sets) => { if (live) { setDisliked(sets.disliked); setMeh(sets.meh); } }).catch(() => {});
    loadLikeCounts(ids).then((map) => { if (live) setCounts(map); }).catch(() => {});
    if (withOwnerCounts) loadMyReactionCounts(ids).then((map) => { if (live) { setDislikeCounts(map.dislikes); setMehCounts(map.mehs); } }).catch(() => {});
    return () => { live = false; };
  }, [active, profileId, idsKey, withOwnerCounts]);
  const reacted = (trackId: string) => { const key = likeKey(trackId); return liked.has(key) || disliked.has(key) || meh.has(key); };
  const react = useCallback(async (trackId: string, reaction: TrackReaction): Promise<boolean> => {
    const key = likeKey(trackId);
    if (!profileId || !key || busy.current.has(key) || liked.has(key) || disliked.has(key) || meh.has(key)) return false;
    busy.current.add(key);
    const setSet = reaction === 'LIKE' ? setLiked : reaction === 'MEH' ? setMeh : setDisliked;
    setSet((previous) => new Set(previous).add(key));
    if (reaction === 'LIKE') setCounts((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
    try {
      if (reaction === 'LIKE') await addTrackLike(profileId, key); else await addTrackNegative(profileId, key, reaction);
      return true;
    } catch {
      setSet((previous) => { const next = new Set(previous); next.delete(key); return next; });
      if (reaction === 'LIKE') setCounts((previous) => ({ ...previous, [key]: Math.max(0, (previous[key] ?? 0) - 1) }));
      return false;
    } finally { busy.current.delete(key); }
  }, [profileId, liked, disliked, meh]);
  return { liked, disliked, meh, counts, dislikeCounts, mehCounts, react, reacted };
}
