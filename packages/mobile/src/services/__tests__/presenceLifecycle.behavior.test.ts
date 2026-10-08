const mockCallbacks: { auth?: (event: string, session: unknown) => void } = {};
const mockPing = jest.fn().mockResolvedValue(undefined);
const mockGetAvailability = jest.fn().mockResolvedValue(false);
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: jest.fn() },
}));
jest.mock('../profilePresenceService', () => ({
  pingProfilePresence: () => mockPing(),
  PROFILE_PRESENCE_INTERVAL_MS: 300000,
  resetProfilePresenceHeartbeat: jest.fn(),
}));
jest.mock('../keepBattleLiveService', () => ({
  getManualBattleAvailability: () => mockGetAvailability(),
  setManualBattleAvailability: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../supabaseClient', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => { mockCallbacks.auth = callback; },
  } },
}));
const { useBattleAvailabilityStore } = require('../../store/useBattleAvailabilityStore');
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

describe('cycle présence propriétaire unique, même Battle OFF', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useBattleAvailabilityStore.getState().reset();
    mockPing.mockClear();
    mockGetAvailability.mockReset().mockResolvedValue(false);
  });
  afterEach(() => { useBattleAvailabilityStore.getState().reset(); jest.useRealTimers(); });

  it('une session restaure le heartbeat OFF et TOKEN_REFRESHED ne redémarre pas la synchronisation', async () => {
    mockCallbacks.auth?.('SIGNED_IN', { user: { id: 'user-a' } });
    await settle();
    expect(mockGetAvailability).toHaveBeenCalledTimes(1);
    expect(useBattleAvailabilityStore.getState().available).toBe(false);
    mockCallbacks.auth?.('TOKEN_REFRESHED', { user: { id: 'user-a' } });
    await settle();
    expect(mockGetAvailability).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('logout stoppe le timer et une réponse serveur tardive ne le ressuscite pas', async () => {
    let resolveAvailability: (value: boolean) => void = () => {};
    mockGetAvailability.mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveAvailability = resolve; }));
    mockCallbacks.auth?.('SIGNED_IN', { user: { id: 'user-a' } });
    await settle();
    mockCallbacks.auth?.('SIGNED_OUT', null);
    resolveAvailability(true);
    await settle();
    expect(jest.getTimerCount()).toBe(0);
    expect(useBattleAvailabilityStore.getState().available).toBe(false);
  });
});
