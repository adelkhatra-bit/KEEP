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
 * Âge d'une musique de story (Adel, 05/10/2026) : on dit SEULEMENT depuis quand elle est en ligne — « il y a 29 min », « il y a 2 h ».
 * L'utilisateur sait qu'une story dure 24 h : plus elle est ancienne, plus il comprend qu'elle va bientôt finir. Aucune durée restante.
 */
export function formatStoryAge(addedAtIso: string | null | undefined, now = Date.now()): string | null {
  if (!addedAtIso) return null;
  const at = new Date(addedAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const elapsedMin = Math.max(0, Math.floor((now - at) / 60000));
  if (elapsedMin < 1) return 'à l’instant';
  if (elapsedMin < 60) return `il y a ${elapsedMin} min`;
  return `il y a ${Math.floor(elapsedMin / 60)} h`;
}
