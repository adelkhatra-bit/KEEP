import { useEffect, useState } from 'react';
import { formatStoryCountdown } from './storyActivity';

/** Chronomètre 24 h qui avance chaque seconde (affichage seul, aucun réseau). */
export function useStoryCountdown(addedAtIso: string | null | undefined, active: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !addedAtIso) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, addedAtIso]);
  return formatStoryCountdown(addedAtIso, now);
}
