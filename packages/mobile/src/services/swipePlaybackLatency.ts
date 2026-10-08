type VisibilitySource = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/** Le chargement en arrière-plan n'est pas une attente visible par l'utilisateur. */
export function measureSwipePlaybackLatency(
  source: VisibilitySource | undefined = typeof document === 'undefined' ? undefined : document,
  now: () => number = Date.now,
): { finish: () => number | null; dispose: () => void } {
  let visibleSince: number | null = !source || source.visibilityState === 'visible' ? now() : null;
  let elapsed = 0;
  const onVisibility = () => {
    const at = now();
    if (visibleSince !== null) elapsed += Math.max(0, at - visibleSince);
    visibleSince = source?.visibilityState === 'visible' ? at : null;
  };
  source?.addEventListener('visibilitychange', onVisibility);
  const dispose = () => source?.removeEventListener('visibilitychange', onVisibility);
  return {
    finish: () => {
      dispose();
      if (source && source.visibilityState !== 'visible') return null;
      const waited = elapsed + (visibleSince === null ? 0 : Math.max(0, now() - visibleSince));
      return waited > 30000 ? null : waited;
    },
    dispose,
  };
}
