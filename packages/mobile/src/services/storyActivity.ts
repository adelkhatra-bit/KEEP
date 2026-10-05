// Règle pure (sans dépendance) : membre « endormi » = aucune activité depuis plus de 14 jours (Adel, 05/10/2026).
export const DORMANT_AFTER_DAYS = 14;
export function isDormantMember(lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastActiveAt) return true;
  const at = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at > DORMANT_AFTER_DAYS * 86400 * 1000;
}
