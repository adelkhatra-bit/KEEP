import { useCallback, useEffect, useRef, useState } from 'react';
import { addTrackLike, loadLikeCounts, loadMyLikesAmong } from './trackLikesService';
import { likeKey } from './trackLikeKey';

/** J'aime d'une liste de musiques : état du cœur, compteurs, ajout optimiste avec retour arrière (utilisé par le lecteur Swipe et l'aperçu des collections en vente). */
export function useTrackLikes(profileId: string | null | undefined, trackIds: string[], active: boolean) {
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const idsKey = trackIds.map(likeKey).join('|');
  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!active || !profileId || !idsKey) return undefined;
    let live = true;
    const ids = idsKey.split('|');
    loadMyLikesAmong(profileId, ids).then((set) => { if (live) setLiked(set); }).catch(() => {});
    loadLikeCounts(ids).then((map) => { if (live) setCounts(map); }).catch(() => {});
    return () => { live = false; };
  }, [active, profileId, idsKey]);
  // Un appui sur un cœur vide l'allume (rouge) ; un cœur déjà rouge reste rouge (pas de suppression depuis le lecteur).
  const toggle = useCallback(async (trackId: string) => {
    const key = likeKey(trackId);
    if (!profileId || !key || busy.current.has(key) || liked.has(key)) return;
    busy.current.add(key);
    setLiked((previous) => new Set(previous).add(key));
    setCounts((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
    try { await addTrackLike(profileId, key); }
    catch {
      setLiked((previous) => { const next = new Set(previous); next.delete(key); return next; });
      setCounts((previous) => ({ ...previous, [key]: Math.max(0, (previous[key] ?? 0) - 1) }));
    } finally { busy.current.delete(key); }
  }, [profileId, liked]);
  return { liked, counts, toggle };
}
