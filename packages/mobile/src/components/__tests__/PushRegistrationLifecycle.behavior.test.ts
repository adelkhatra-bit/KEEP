const mockCallbacks: { auth?: (event: string, session: unknown) => void; app?: (state: string) => void; cleanup?: () => void } = {};
const mockRegister = jest.fn();
const mockCancel = jest.fn();
const mockState = { foreground: true };
jest.mock('react', () => ({
  __esModule: true,
  default: { useEffect: (effect: () => (() => void)) => { mockCallbacks.cleanup = effect(); } },
}));
jest.mock('react-native', () => ({
  AppState: { addEventListener: (_event: string, callback: (state: string) => void) => {
    mockCallbacks.app = callback;
    return { remove: jest.fn() };
  } },
}));
jest.mock('../../services/profilePresenceService', () => ({ isProfilePresenceForeground: () => mockState.foreground }));
jest.mock('../../services/pushNotificationService', () => ({
  registerForPushNotifications: (...args: unknown[]) => mockRegister(...args),
  cancelPushRegistration: () => mockCancel(),
  listenForExpoPushTokenChanges: () => jest.fn(),
}));
jest.mock('../../services/supabaseClient', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: { user: { id: 'user-a' } } } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      mockCallbacks.auth = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    },
  } },
}));
const Lifecycle = require('../PushRegistrationLifecycle').default;
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

describe('cycle push : session, foreground et retry borné', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRegister.mockReset().mockResolvedValue({ ok: true });
    mockCancel.mockClear();
    mockState.foreground = true;
  });
  afterEach(() => { mockCallbacks.cleanup?.(); jest.useRealTimers(); });

  it('startup et nouvelle connexion enregistrent, TOKEN_REFRESHED ne boucle pas', async () => {
    Lifecycle();
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    mockCallbacks.auth?.('TOKEN_REFRESHED', { user: { id: 'user-a' } });
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    mockCallbacks.auth?.('SIGNED_IN', { user: { id: 'user-b' } });
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('une erreur réseau permet un seul retry après cinq minutes', async () => {
    mockRegister.mockResolvedValue({ ok: false, reason: 'network_error' });
    Lifecycle();
    await settle();
    jest.advanceTimersByTime(299999);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(900000);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('permission refusée ne crée aucun retry', async () => {
    mockRegister.mockResolvedValue({ ok: false, reason: 'permission_denied' });
    Lifecycle();
    await settle();
    jest.advanceTimersByTime(900000);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('logout annule retry et foreground ne réinscrit pas le compte déconnecté', async () => {
    mockRegister.mockResolvedValue({ ok: false, reason: 'network_error' });
    Lifecycle();
    await settle();
    mockCallbacks.auth?.('SIGNED_OUT', null);
    mockCallbacks.app?.('active');
    jest.advanceTimersByTime(900000);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalled();
  });

  it('le retry ne contacte pas le réseau en arrière-plan', async () => {
    mockRegister.mockResolvedValue({ ok: false, reason: 'network_error' });
    Lifecycle();
    await settle();
    mockState.foreground = false;
    jest.advanceTimersByTime(300000);
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    mockState.foreground = true;
    mockCallbacks.app?.('active');
    await settle();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });
});
