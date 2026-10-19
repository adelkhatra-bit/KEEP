/**
 * Règle de démarrage d'un extrait (source unique, sans dépendance native pour être testable).
 * Cause racine AUDIO_PREVIEW_NOT_PLAYING (06/10/2026) : iOS répond isPlaying=false + isBuffering=true pendant que
 * l'extrait distant remplit son tampon ; ce n'est pas un échec si la lecture est demandée (shouldPlay=true).
 */
export const AUDIO_START_CONFIRM_MS = 1500;
export const AUDIO_START_POLL_MS = 100;

export type PreviewStartStatus = { isLoaded: boolean; isPlaying?: boolean; isBuffering?: boolean; shouldPlay?: boolean };

/** Lecture acceptée : elle joue, ou iOS tamponne encore alors que la lecture est demandée. */
export function isPreviewStartAccepted(status: PreviewStartStatus): boolean {
  if (!status?.isLoaded) return false;
  if (status.isPlaying) return true;
  return Boolean(status.shouldPlay) && Boolean(status.isBuffering);
}

/**
 * After a few seconds, a still-buffering stream with shouldPlay=true is not
 * actually audible. Repeating the first "accepted start" forever would leave
 * Loki Swipe stuck on a silent card. An intentionally paused sound is not a
 * stall and must never be advanced automatically.
 */
export function isPreviewStillStalled(
  status: PreviewStartStatus & { positionMillis?: number },
  minimumProgressMillis = 350,
): boolean {
  if (!status?.isLoaded) return true;
  if (!status.shouldPlay) return false;
  if (!status.isPlaying) return true;
  return (status.positionMillis ?? 0) < minimumProgressMillis;
}
