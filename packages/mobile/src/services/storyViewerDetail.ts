// Détail d'un spectateur de MA story (Adel, 06/10/2026) : pour chaque musique, combien de temps, si c'est là qu'il est parti, et s'il l'a aimée (❤).
// Module pur. Les chapitres viennent des sessions de vue (keep_my_story_viewers_v3) ; le ❤ de `track_likes` (lecture publique, comme le profil).
export type DetailTrack = { id: string; title: string; artist?: string | null };
export type DetailRow = { index: number; title: string; artist: string; seconds: number; state: 'LEFT_HERE' | 'WATCHED' | 'NOT_SEEN'; liked: boolean };
export type ViewerDetail = { rows: DetailRow[]; summary: string; leftAtTitle: string | null };

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
export const formatDetailSeconds = fmt;

export function buildViewerDetail(
  tracks: DetailTrack[],
  viewer: { chapters: Array<{ index: number; seconds: number }>; tracksSeen: number; tracksTotal: number; watching: boolean },
  likedKeys: Set<string>,
  keyOf: (id: string) => string = (id) => id,
): ViewerDetail {
  const secondsBy = new Map<number, number>();
  viewer.chapters.forEach((c) => secondsBy.set(c.index, (secondsBy.get(c.index) ?? 0) + Math.max(0, c.seconds)));
  const lastSeen = Math.max(-1, viewer.tracksSeen - 1, ...viewer.chapters.filter((c) => c.seconds > 0 || c.index >= 0).map((c) => c.index));
  const total = tracks.length || viewer.tracksTotal;
  const finished = lastSeen >= total - 1 && !viewer.watching;
  const rows: DetailRow[] = tracks.map((t, index) => {
    const seconds = secondsBy.get(index) ?? 0;
    const reached = index <= lastSeen;
    const leftHere = reached && index === lastSeen && !finished && !viewer.watching;
    return { index, title: t.title, artist: String(t.artist ?? ''), seconds, state: leftHere ? 'LEFT_HERE' : reached ? 'WATCHED' : 'NOT_SEEN', liked: likedKeys.has(keyOf(t.id)) };
  });
  const left = rows.find((r) => r.state === 'LEFT_HERE') ?? null;
  const likedN = rows.filter((r) => r.liked).length;
  const seenN = rows.filter((r) => r.state !== 'NOT_SEEN').length;
  const summary = [`A vu ${seenN} musique${seenN > 1 ? 's' : ''} sur ${total}`, likedN ? `${likedN} ❤` : null, left ? `parti pendant « ${left.title} »` : finished ? 'est allé jusqu’au bout' : viewer.watching ? 'regarde en ce moment' : null].filter(Boolean).join(' · ');
  return { rows, summary, leftAtTitle: left ? left.title : null };
}
