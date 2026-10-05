import { useCallback, useEffect, useRef, useState } from 'react';
import { addTrackDislike, addTrackLike, loadLikeCounts, loadMyDislikeCounts, loadMyDislikesAmong, loadMyLikesAmong } from './trackLikesService';
import { likeKey } from './trackLikeKey';

export type TrackReaction = 'LIKE' | 'DISLIKE';

/**
 * Réactions d'une liste de musiques (Adel 05/10/2026) : cœur / « pas aimé », compteurs, ajout optimiste avec retour arrière.
 * Une musique ne reçoit qu'UNE réaction depuis un lecteur et elle n'est pas retirée d'ici (donnée de goût protégée) ; le partageur lit des compteurs.
 */
export function useTrackLikes(profileId: string | null | undefined, trackIds: string[], active: boolean, withDislikeCounts = false) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [disliked, setDisliked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dislikeCounts, setDislikeCounts] = useState<Record<string, number>>({});
  const idsKey = trackIds.map(likeKey).join('|');
  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!active || !profileId || !idsKey) return undefined;
    let live = true;
    const ids = idsKey.split('|');
    loadMyLikesAmong(profileId, ids).then((set) => { if (live) setLiked(set); }).catch(() => {});
    loadMyDislikesAmong(profileId, ids).then((set) => { if (live) setDisliked(set); }).catch(() => {});
    loadLikeCounts(ids).then((map) => { if (live) setCounts(map); }).catch(() => {});
    if (withDislikeCounts) loadMyDislikeCounts(ids).then((map) => { if (live) setDislikeCounts(map); }).catch(() => {});
    return () => { live = false; };
  }, [active, profileId, idsKey, withDislikeCounts]);
  const react = useCallback(async (trackId: string, reaction: TrackReaction): Promise<boolean> => {
    const key = likeKey(trackId);
    if (!profileId || !key || busy.current.has(key) || liked.has(key) || disliked.has(key)) return false;
    busy.current.add(key);
    const setSet = reaction === 'LIKE' ? setLiked : setDisliked;
    setSet((previous) => new Set(previous).add(key));
    if (reaction === 'LIKE') setCounts((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
    try {
      if (reaction === 'LIKE') await addTrackLike(profileId, key); else await addTrackDislike(profileId, key);
      return true;
    } catch {
      setSet((previous) => { const next = new Set(previous); next.delete(key); return next; });
      if (reaction === 'LIKE') setCounts((previous) => ({ ...previous, [key]: Math.max(0, (previous[key] ?? 0) - 1) }));
      return false;
    } finally { busy.current.delete(key); }
  }, [profileId, liked, disliked]);
  return { liked, disliked, counts, dislikeCounts, react, reacted: (trackId: string) => liked.has(likeKey(trackId)) || disliked.has(likeKey(trackId)) };
}
