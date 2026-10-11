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
