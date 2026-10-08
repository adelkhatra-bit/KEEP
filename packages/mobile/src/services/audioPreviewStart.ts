/**
 * Règle de démarrage d'un extrait (source unique, sans dépendance native pour être testable).
 * Un tamponnage est transitoire, mais ne prouve jamais un démarrage audible.
 */
export const AUDIO_START_CONFIRM_MS = 5000;
export const AUDIO_LOAD_CONFIRM_MS = 8000;
export const AUDIO_START_POLL_MS = 100;

export type PreviewStartStatus = { isLoaded: boolean; isPlaying?: boolean; isBuffering?: boolean; shouldPlay?: boolean };

/** Seule une lecture réellement démarrée peut lancer le chrono Solo. */
export function isPreviewStartAccepted(status: PreviewStartStatus): boolean {
  if (!status?.isLoaded) return false;
  return Boolean(status.isPlaying);
}
