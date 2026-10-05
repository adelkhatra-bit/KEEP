// Vues de story façon Instagram (Adel, 05/10/2026) : une vue ne compte qu'après un délai de présence réelle ;
// on suit les secondes passées, les musiques vues, l'écoute et l'instant du départ. Source unique : ce fichier + RPC keep_story_watch_*.
export const STORY_WATCH_MIN_MS = 2000;
export const STORY_WATCH_PING_MS = 10000;

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data?: any; error?: any }>;
export type StoryWatchEvent = { type: 'shown' | 'listen'; trackId: string; index?: number; total?: number };

export type StoryWatchTracker = { event: (event: StoryWatchEvent) => void; stop: () => void };

/** Démarre le suivi d'une story d'autrui. Rien n'est écrit avant STORY_WATCH_MIN_MS ; `stop()` envoie le départ. */
export function startStoryWatch(ownerId: string, tracksTotal: number, rpc: Rpc, now: () => number = Date.now): StoryWatchTracker {
  const openedAt = now();
  let sessionId: string | null = null;
  let stopped = false;
  let tracksSeen = 0;
  let maxIndex = -1;
  let lastTrackId: string | null = null;
  let listened = false;
  // Chapitres : chaque musique de la story est un chapitre ; on mesure le temps passé dans chacun, de son arrivée jusqu'à la musique suivante.
  const chapterSeconds: Record<number, number> = {};
  let chapterIndex = -1;
  let chapterStartedAt = 0;
  const chaptersPayload = () => {
    const live = { ...chapterSeconds };
    if (chapterIndex >= 0) live[chapterIndex] = (live[chapterIndex] ?? 0) + Math.max(0, Math.round((now() - chapterStartedAt) / 1000));
    return Object.entries(live).map(([i, s]) => ({ i: Number(i), s }));
  };
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const seconds = () => Math.max(0, Math.round((now() - openedAt) / 1000));
  const ping = (ended: boolean) => {
    if (!sessionId) return;
    void Promise.resolve(rpc('keep_story_watch_chapters_ping', { p_session_id: sessionId, p_seconds: seconds(), p_tracks_seen: tracksSeen, p_last_track_id: lastTrackId, p_listened: listened, p_ended: ended, p_chapters: chaptersPayload() })).catch(() => {});
  };

  startTimer = setTimeout(async () => {
    startTimer = null;
    if (stopped) return;
    try {
      const { data, error } = await rpc('keep_story_watch_start', { p_owner_id: ownerId, p_tracks_total: tracksTotal });
      if (error || !data) return;
      sessionId = String(data);
      if (stopped) { ping(true); return; }
      ping(false);
      pingTimer = setInterval(() => ping(false), STORY_WATCH_PING_MS);
    } catch { /* le suivi ne doit jamais gêner la lecture */ }
  }, STORY_WATCH_MIN_MS);

  return {
    event(event) {
      if (event.type === 'shown') {
        if (typeof event.index === 'number') {
          // Le chapitre qui se termine reçoit son temps exact, le nouveau démarre maintenant.
          if (chapterIndex >= 0) chapterSeconds[chapterIndex] = (chapterSeconds[chapterIndex] ?? 0) + Math.max(0, Math.round((now() - chapterStartedAt) / 1000));
          chapterIndex = event.index;
          chapterStartedAt = now();
          if (event.index > maxIndex) { maxIndex = event.index; tracksSeen = maxIndex + 1; }
        }
        lastTrackId = /^[0-9a-f-]{36}$/i.test(event.trackId) ? event.trackId : lastTrackId;
      } else {
        listened = true;
      }
      if (sessionId && event.type === 'listen') ping(false);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (startTimer) { clearTimeout(startTimer); startTimer = null; return; } // parti avant le délai : aucune vue
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      ping(true);
    },
  };
}
