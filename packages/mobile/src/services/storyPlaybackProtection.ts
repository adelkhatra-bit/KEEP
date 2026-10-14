/**
 * Empêche « Trouver le morceau » de reconnaître un extrait diffusé par
 * Loki lui-même pendant une Story. Le verrou est partagé entre écrans et
 * appareils du même runtime (web / iOS) ; les autres applications ou micros
 * externes ne peuvent pas être contrôlés par ce mécanisme.
 *
 * Les compteurs évitent de réactiver le micro lors du passage d'une Story à
 * une autre. La session d'écoute existante reprend après la dernière fermeture.
 */
let activeStories = 0;
let resumeListeningOnClose = false;
let resumeListening: (() => void) | null = null;

export function isProtectedStoryPlaybackActive(): boolean {
  return activeStories > 0;
}

export function acquireProtectedStoryPlayback(
  pauseListen: () => boolean,
  resumeListen: () => void,
): () => void {
  if (activeStories === 0) {
    resumeListeningOnClose = pauseListen();
    resumeListening = resumeListen;
  }
  activeStories += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeStories = Math.max(0, activeStories - 1);
    if (activeStories === 0) {
      const shouldResume = resumeListeningOnClose;
      const resume = resumeListening;
      resumeListeningOnClose = false;
      resumeListening = null;
      if (shouldResume) resume?.();
    }
  };
}
