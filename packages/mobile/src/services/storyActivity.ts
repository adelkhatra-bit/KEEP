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

/** Détail d'une vue de story pour le propriétaire (Adel 05/10/2026) : 2 lignes courtes, façon Instagram. */
export function formatWatchDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

export function formatWatchDetail(
  v: { seconds: number; tracksSeen: number; tracksTotal: number; listened: boolean; watching: boolean; leftAt: string | null },
  now: number = Date.now(),
): { status: string; detail: string } {
  const status = v.watching
    ? 'regarde maintenant'
    : v.leftAt
      ? `parti ${formatStoryAge(v.leftAt, now)}`
      : 'a regardé';
  const parts = [formatWatchDuration(v.seconds)];
  if (v.tracksTotal > 0) parts.push(`${Math.min(v.tracksSeen, v.tracksTotal)}/${v.tracksTotal} musique${v.tracksTotal > 1 ? 's' : ''}`);
  parts.push(v.listened ? 'écouté' : 'pas écouté');
  return { status, detail: parts.join(' · ') };
}

/** Fenêtre « profil sans story du jour » (Adel 05/10/2026) : depuis quand la personne n'a rien partagé, en une ligne. */
export function formatLastShared(lastSharedIso: string | null | undefined, now = Date.now()): string {
  if (!lastSharedIso) return 'Rien partagé pour l’instant';
  const at = new Date(lastSharedIso).getTime();
  if (!Number.isFinite(at)) return 'Rien partagé pour l’instant';
  const hours = Math.max(0, Math.floor((now - at) / 3600000));
  if (hours < 1) return 'Dernier partage : à l’instant';
  if (hours < 24) return `Dernier partage : il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 14 ? `Dernier partage : il y a ${days} j` : `Dernier partage : il y a ${Math.floor(days / 7)} sem.`;
}
