// Règle pure (sans dépendance) : membre « endormi » = aucune activité depuis plus de 14 jours (Adel, 05/10/2026).
export const DORMANT_AFTER_DAYS = 14;
export function isDormantMember(lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastActiveAt) return true;
  const at = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at > DORMANT_AFTER_DAYS * 86400 * 1000;
}

/**
 * Âge d'une musique de story (Adel, 05/10/2026) : « ajoutée il y a 2 h 03 · encore visible 21 h 57 ». Une story dure 24 h pile depuis l'ajout.
 */
export function formatStoryAge(addedAtIso: string | null | undefined, now = Date.now(), windowHours = 24): string | null {
  if (!addedAtIso) return null;
  const at = new Date(addedAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const elapsedMin = Math.max(0, Math.floor((now - at) / 60000));
  const leftMin = Math.max(0, windowHours * 60 - elapsedMin);
  const fmt = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  };
  // Court, sur UNE seule ligne (Adel 05/10/2026) : « il y a 2 h 03 · reste 21 h 57 ».
  return `il y a ${fmt(elapsedMin)} · reste ${fmt(leftMin)}`;
}
