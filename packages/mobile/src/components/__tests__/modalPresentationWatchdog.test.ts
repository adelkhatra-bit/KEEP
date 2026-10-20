// Comportement du filet iPhone de la fenêtre Swipe (ERR-SWIPE-MODAL-NOT-PRESENTED-20261020).
import { createPresentationWatchdog } from '../modalPresentationWatchdog';

function setup() {
  const calls: string[] = [];
  const wd = createPresentationWatchdog({
    hide: () => calls.push('hide'),
    reshow: () => calls.push('reshow'),
    giveUp: () => calls.push('giveUp'),
    report: (code, detail) => calls.push(`${code}:${detail}`),
  });
  return { wd, calls };
}

describe('filet de présentation de la fenêtre Swipe (iPhone)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ne fait rien si la fenêtre s’affiche à temps', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(300); wd.shown(); jest.advanceTimersByTime(10_000);
    expect(calls).toEqual([]);
  });

  it('retire puis représente la fenêtre, une seule fois par essai, et s’arrête dès qu’elle s’affiche', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(1200);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide']);
    jest.advanceTimersByTime(400);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide', 'reshow']);
    wd.shown(); jest.advanceTimersByTime(10_000);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide', 'reshow', 'SWIPE_MODAL_SHOWN_AFTER_RETRY:attempt=1']);
    expect(calls.filter((c) => c === 'giveUp')).toHaveLength(0);
  });

  it('abandonne une seule fois après 2 essais si la fenêtre ne s’affiche jamais', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(60_000);
    expect(calls).toEqual([
      'SWIPE_MODAL_RETRY:attempt=1', 'hide', 'reshow',
      'SWIPE_MODAL_RETRY:attempt=2', 'hide', 'reshow',
      'SWIPE_MODAL_NOT_PRESENTED:attempts=3', 'giveUp',
    ]);
  });

  it('annule tout à la fermeture, même pendant le retrait (la fenêtre n’est jamais laissée retirée)', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(1300); // retirée
    wd.stop(); jest.advanceTimersByTime(60_000);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide', 'reshow']);
    wd.shown(); expect(calls).toHaveLength(3); // un onShow tardif après fermeture est ignoré
  });

  it('un onShow tardif pendant le retrait remet la fenêtre une seule fois', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(1250);
    wd.shown(); jest.advanceTimersByTime(60_000);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide', 'SWIPE_MODAL_SHOWN_AFTER_RETRY:attempt=1', 'reshow']);
    wd.shown(); expect(calls).toHaveLength(4);
  });

  it('un nouveau démarrage repart de zéro', () => {
    const { wd, calls } = setup();
    wd.start(); jest.advanceTimersByTime(1200); wd.stop(); calls.length = 0;
    wd.start(); expect(wd.attempt).toBe(0); jest.advanceTimersByTime(1200);
    expect(calls).toEqual(['SWIPE_MODAL_RETRY:attempt=1', 'hide']);
  });
});
