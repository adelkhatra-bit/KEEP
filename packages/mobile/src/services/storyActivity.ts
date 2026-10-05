// Règle pure (sans dépendance) : membre « endormi » = aucune activité depuis plus de 7 jours ; sa bulle (sans story) DISPARAÎT de la rangée
// automatiquement et revient dès qu'il se reconnecte (Adel, 05/10/2026 : « quasi une semaine sans connexion → masque la bulle »).
export const DORMANT_AFTER_DAYS = 7;
export function isDormantMember(lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastActiveAt) return true;
  const at = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at > DORMANT_AFTER_DAYS * 86400 * 1000;
}

/**
 * Durée restante d'une musique de story (Adel, 05/10/2026) : une story dure 24 h pile depuis l'ajout ; on n'affiche QUE le temps restant,
 * en heures pleines qui descendent (24 h → 23 h → … → 1 h), puis en minutes sous l'heure : « reste 24 h », « reste 23 h », « reste 42 min ».
 */
export function formatStoryAge(addedAtIso: string | null | undefined, now = Date.now(), windowHours = 24): string | null {
  if (!addedAtIso) return null;
  const at = new Date(addedAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const elapsedMin = Math.max(0, Math.floor((now - at) / 60000));
  const leftMin = Math.max(0, windowHours * 60 - elapsedMin);
  if (leftMin >= 60) return `reste ${Math.ceil(leftMin / 60)} h`;
  return `reste ${leftMin} min`;
}
