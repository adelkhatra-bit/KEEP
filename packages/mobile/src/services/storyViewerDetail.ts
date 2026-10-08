// Détail d'un spectateur de MA story, façon Instagram (Adel, 06/10/2026) : « la seule chose que l'utilisateur veut savoir,
// c'est QUELLE musique il a vue et ce qu'il en a fait » — écoutée en entier, passée (swipe), ou arrêté là. Aucune durée affichée.
// Module pur. Données : keep_my_story_viewers_v4 (identifiant réel de chaque musique) ; repli sur la position pour les anciennes vues.
export type DetailTrack = { id: string; title: string; artist?: string | null };
export type DetailOutcome = 'FULL' | 'SKIPPED' | 'LEFT_HERE' | 'WATCHING';
export type DetailRow = { index: number; trackId: string; title: string; artist: string; outcome: DetailOutcome; label: string; liked: boolean };
export type ViewerDetail = { rows: DetailRow[]; summary: string; leftAtTitle: string | null };
export type ViewerForDetail = {
  chapters: Array<{ index: number; seconds: number }>;
  trackViews?: Array<{ trackId: string; seconds: number }>;
  lastTrackId?: string | null;
  tracksSeen: number;
  tracksTotal: number;
  watching: boolean;
};

/** Un extrait dure 30 s : à partir de 25 s on considère la musique écoutée en entier. */
export const FULL_LISTEN_SECONDS = 25;

export const OUTCOME_LABEL: Record<DetailOutcome, string> = {
  FULL: '✓ Écoutée en entier',
  SKIPPED: '⏭ Passée',
  LEFT_HERE: '■ Arrêté ici',
  WATCHING: '● Écoute en ce moment',
};

export function buildViewerDetail(
  tracks: DetailTrack[],
  viewer: ViewerForDetail,
  likedKeys: Set<string>,
  keyOf: (id: string) => string = (id) => id,
): ViewerDetail {
  // 1) Temps par musique : par identifiant réel quand on l'a (fiable), sinon par position (anciennes vues).
  const secondsById = new Map<string, number>();
  const byId = (viewer.trackViews ?? []).filter((v) => v.trackId);
  if (byId.length) {
    byId.forEach((v) => secondsById.set(keyOf(v.trackId), Math.max(secondsById.get(keyOf(v.trackId)) ?? 0, Math.max(0, v.seconds))));
  } else {
    viewer.chapters.forEach((c) => {
      const t = tracks[c.index];
      if (t) secondsById.set(keyOf(t.id), Math.max(secondsById.get(keyOf(t.id)) ?? 0, Math.max(0, c.seconds)));
    });
  }
  const lastKey = viewer.lastTrackId ? keyOf(viewer.lastTrackId) : null;
  if (lastKey && !secondsById.has(lastKey) && tracks.some((t) => keyOf(t.id) === lastKey)) secondsById.set(lastKey, 0);

  // 2) Une ligne par musique VUE seulement (comme Instagram : on ne liste pas ce qu'il n'a pas vu), dans l'ordre de la story.
  const rows: DetailRow[] = [];
  tracks.forEach((t, index) => {
    const key = keyOf(t.id);
    if (!secondsById.has(key)) return;
    const seconds = secondsById.get(key) ?? 0;
    const isLast = lastKey === key;
    const outcome: DetailOutcome = isLast && viewer.watching ? 'WATCHING' : seconds >= FULL_LISTEN_SECONDS ? 'FULL' : isLast ? 'LEFT_HERE' : 'SKIPPED';
    rows.push({ index, trackId: t.id, title: t.title, artist: String(t.artist ?? ''), outcome, label: OUTCOME_LABEL[outcome], liked: likedKeys.has(key) });
  });

  const left = rows.find((r) => r.outcome === 'LEFT_HERE') ?? null;
  const full = rows.filter((r) => r.outcome === 'FULL').length;
  const likedN = rows.filter((r) => r.liked).length;
  const seenN = rows.length;
  const summary = [
    `${seenN} musique${seenN > 1 ? 's' : ''} vue${seenN > 1 ? 's' : ''}`,
    full ? `${full} en entier` : null,
    likedN ? `${likedN} ❤` : null,
  ].filter(Boolean).join(' · ');
  return { rows, summary, leftAtTitle: left ? left.title : null };
}
