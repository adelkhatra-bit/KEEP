/**
 * Filet iPhone pour une fenêtre plein écran (Swipe) : iOS peut refuser de l'afficher si une autre fenêtre
 * est encore à l'écran ou en train de se fermer (journal du 20/10, 20:48 UTC : SWIPE_MODAL_NOT_PRESENTED
 * après Mes Sessions → Session). Une seule fenêtre existe toujours : on la retire puis on la représente,
 * au plus `maxRetries` fois, puis on abandonne proprement. Logique pure (sans React) pour être testée.
 */
export type PresentationWatchdog = {
  start: () => void;
  shown: () => void;
  stop: () => void;
  readonly attempt: number;
};

export function createPresentationWatchdog(opts: {
  hide: () => void;
  reshow: () => void;
  giveUp: () => void;
  report: (code: string, detail: string) => void;
  firstWaitMs?: number;
  retryGapMs?: number;
  maxRetries?: number;
}): PresentationWatchdog {
  const wait = opts.firstWaitMs ?? 1200;
  const gap = opts.retryGapMs ?? 400;
  const max = opts.maxRetries ?? 2;
  let attempt = 0;
  let active = false;
  let isShown = false;
  let hidden = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const reshow = () => { hidden = false; opts.reshow(); };
  const arm = () => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (!active || isShown) return;
      if (attempt < max) {
        attempt += 1;
        opts.report('SWIPE_MODAL_RETRY', `attempt=${attempt}`);
        hidden = true;
        opts.hide();
        timer = setTimeout(() => {
          timer = null;
          if (!active || isShown) return;
          reshow();
          arm();
        }, gap);
        return;
      }
      opts.report('SWIPE_MODAL_NOT_PRESENTED', `attempts=${attempt + 1}`);
      active = false;
      opts.giveUp();
    }, wait);
  };
  return {
    start() { clear(); attempt = 0; isShown = false; hidden = false; active = true; arm(); },
    shown() {
      if (!active || isShown) return;
      isShown = true;
      clear();
      if (attempt > 0) opts.report('SWIPE_MODAL_SHOWN_AFTER_RETRY', `attempt=${attempt}`);
      // Un onShow tardif peut arriver pendant le court retrait : on ne laisse jamais la fenêtre retirée.
      if (hidden) reshow();
    },
    stop() { active = false; clear(); if (hidden) { hidden = false; opts.reshow(); } },
    get attempt() { return attempt; },
  };
}
