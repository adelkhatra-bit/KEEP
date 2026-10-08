import { measureSwipePlaybackLatency } from '../swipePlaybackLatency';

describe('SWIPE_SLOW — présence réelle', () => {
  let at: number;
  let listener: () => void;
  let source: any;
  beforeEach(() => {
    at = 0;
    listener = () => {};
    source = {
      visibilityState: 'visible',
      addEventListener: jest.fn((_, callback) => { listener = callback; }),
      removeEventListener: jest.fn(),
    };
  });
  it('mesure le délai visible jusqu’au démarrage et libère le listener', () => {
    const timer = measureSwipePlaybackLatency(source, () => at);
    at = 2600;
    expect(timer.finish()).toBe(2600);
    expect(source.removeEventListener).toHaveBeenCalledWith('visibilitychange', listener);
  });
  it('exclut les longues périodes en arrière-plan', () => {
    const timer = measureSwipePlaybackLatency(source, () => at);
    at = 1000;
    source.visibilityState = 'hidden'; listener();
    at = 1716000;
    source.visibilityState = 'visible'; listener();
    at += 1600;
    expect(timer.finish()).toBe(2600);
  });
  it('ne rapporte pas un démarrage sur une page cachée', () => {
    const timer = measureSwipePlaybackLatency(source, () => at);
    source.visibilityState = 'hidden'; listener();
    at = 24000;
    expect(timer.finish()).toBeNull();
  });
  it('ne compte pas le temps avant le premier passage au premier plan', () => {
    source.visibilityState = 'hidden';
    const timer = measureSwipePlaybackLatency(source, () => at);
    at = 120000;
    source.visibilityState = 'visible'; listener();
    at += 1000;
    expect(timer.finish()).toBe(1000);
  });
  it('ignore plus de 30 secondes, y compris en natif', () => {
    const timer = measureSwipePlaybackLatency(undefined, () => at);
    at = 30001;
    expect(timer.finish()).toBeNull();
  });
  it('arrête le suivi quand la carte est quittée avant la lecture', () => {
    measureSwipePlaybackLatency(source, () => at).dispose();
    expect(source.removeEventListener).toHaveBeenCalledWith('visibilitychange', listener);
  });
});
