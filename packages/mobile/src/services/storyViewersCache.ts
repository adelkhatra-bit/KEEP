/**
 * Copie locale de la liste des spectateurs de MA story (Adel, 10/10/2026) : « les utilisateurs doivent rester enregistrés
 * pendant la durée de la story ». Le serveur garde déjà 24 h ; cette copie évite seulement que la liste devienne VIDE quand
 * un chargement échoue (réseau coupé, serveur lent). Module pur : aucune dépendance native.
 */
export const STORY_DURATION_MS = 24 * 60 * 60 * 1000;
export const STORY_VIEWERS_CACHE_KEY = 'loki.storyViewers.v1';

type ViewerLike = { viewedAt: string; watching: boolean };

export function serializeStoryViewers<T extends ViewerLike>(ownerId: string, viewers: T[], now: number): string {
  return JSON.stringify({ ownerId, savedAt: now, viewers });
}

/** Spectateurs encore dans la durée de la story, jamais « en train de regarder » (information périmée). */
export function restoreStoryViewers<T extends ViewerLike>(raw: string | null | undefined, ownerId: string, now: number): T[] {
  if (!raw || !ownerId) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.ownerId !== ownerId || !Array.isArray(parsed.viewers)) return [];
    return (parsed.viewers as T[])
      .filter((v) => {
        const at = Date.parse(String(v?.viewedAt ?? ''));
        return Number.isFinite(at) && now - at < STORY_DURATION_MS && at <= now + 60_000;
      })
      .map((v) => ({ ...v, watching: false }));
  } catch {
    return [];
  }
}
