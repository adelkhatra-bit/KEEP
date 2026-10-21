// ERR-SUPABASE-API-POLLING-20261021 : un minuteur réseau ne doit rien appeler
// quand l'app (iPhone) ou l'onglet (PC) est en arrière-plan.

const mockListeners: Array<(state: string) => void> = [];
const mockAppState = { currentState: 'active' as string };

jest.mock('react-native', () => ({
  AppState: {
    get currentState() { return mockAppState.currentState; },
    addEventListener: (_type: string, handler: (state: string) => void) => {
      mockListeners.push(handler);
      return { remove: () => { const i = mockListeners.indexOf(handler); if (i >= 0) mockListeners.splice(i, 1); } };
    },
  },
}));

import { isAppForeground, setVisibleInterval } from '../visibleInterval';

function setState(state: string) {
  mockAppState.currentState = state;
  for (const listener of [...mockListeners]) listener(state);
}

describe('setVisibleInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockListeners.length = 0;
    mockAppState.currentState = 'active';
  });
  afterEach(() => jest.useRealTimers());

  it('appelle normalement quand l’app est au premier plan', () => {
    const fn = jest.fn();
    const stop = setVisibleInterval(fn, 1000);
    jest.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it('n’appelle rien pendant 30 min en arrière-plan, puis rattrape UNE fois au retour', () => {
    const fn = jest.fn();
    const stop = setVisibleInterval(fn, 60_000);
    setState('background');
    jest.advanceTimersByTime(30 * 60_000);
    expect(fn).toHaveBeenCalledTimes(0);
    setState('active');
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });

  it('sans rattrapage quand l’écran recharge déjà au retour (catchUp: false)', () => {
    const fn = jest.fn();
    const stop = setVisibleInterval(fn, 1000, { catchUp: false });
    setState('background');
    jest.advanceTimersByTime(5000);
    setState('active');
    expect(fn).toHaveBeenCalledTimes(0);
    stop();
  });

  it('pas de rattrapage si aucun passage n’a été sauté', () => {
    const fn = jest.fn();
    const stop = setVisibleInterval(fn, 60_000);
    setState('background');
    setState('active');
    expect(fn).toHaveBeenCalledTimes(0);
    stop();
  });

  it('l’arrêt coupe le minuteur et l’écoute AppState', () => {
    const fn = jest.fn();
    const stop = setVisibleInterval(fn, 1000);
    stop();
    jest.advanceTimersByTime(5000);
    setState('background');
    setState('active');
    expect(fn).not.toHaveBeenCalled();
    expect(mockListeners).toHaveLength(0);
  });

  it('« inactive » (iPhone : centre de contrôle, transition) compte comme arrière-plan', () => {
    expect(isAppForeground('inactive')).toBe(false);
    expect(isAppForeground('background')).toBe(false);
    expect(isAppForeground('active')).toBe(true);
    expect(isAppForeground(null)).toBe(true);
  });
});
