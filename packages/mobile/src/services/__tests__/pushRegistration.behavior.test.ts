const mockState = { owner: 'user-a', permission: 'granted', token: 'ExpoPushToken[phone-a]' };
const mockStorage = new Map<string, string>();
const mockRpc = jest.fn().mockResolvedValue({ error: null });
const mockRequestPermission = jest.fn(async () => ({ status: mockState.permission }));
const mockResolveToken = jest.fn(async () => ({ data: mockState.token }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }) },
}));
jest.mock('expo-device', () => ({ isDevice: true, modelName: 'phone', osVersion: '1' }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'project-id' } } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1', nativeBuildVersion: '1' }));
jest.mock('../../navigation/navigationRef', () => ({ navigateFromNotificationData: jest.fn() }));
jest.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: mockState.owner ? { user: { id: mockState.owner } } : null } })) },
    rpc: mockRpc,
    from: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({ error: null }) })),
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn(async () => ({ status: mockState.permission })),
  requestPermissionsAsync: mockRequestPermission,
  setNotificationCategoryAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  getDevicePushTokenAsync: jest.fn().mockResolvedValue({ type: 'android', data: 'native-phone-token' }),
  getExpoPushTokenAsync: mockResolveToken,
}));

const { cancelPushRegistration, registerForPushNotifications, unregisterCurrentPushToken } = require('../pushNotificationService');

describe('enregistrement Expo par connexion et appareil', () => {
  beforeEach(() => {
    mockState.owner = 'user-a';
    mockState.permission = 'granted';
    mockState.token = 'ExpoPushToken[phone-a]';
    mockRpc.mockClear();
    mockRequestPermission.mockClear();
  });

  it('upsert à chaque connexion, avec la même installation malgré une rotation', async () => {
    expect((await registerForPushNotifications()).ok).toBe(true);
    mockState.token = 'ExpoPushToken[phone-a-rotated]';
    expect((await registerForPushNotifications()).ok).toBe(true);
    const first = mockRpc.mock.calls[0];
    const second = mockRpc.mock.calls[1];
    expect(first[0]).toBe('keep_push_token_register_v4');
    expect(first[1].p_device_id).toBe(second[1].p_device_id);
    expect(second[1].p_token).toBe(mockState.token);
    expect(first[1].p_native_token).toBe('native-phone-token');
  });

  it('permission refusée ne relance pas la demande et ne publie aucun token', async () => {
    mockState.permission = 'denied';
    expect((await registerForPushNotifications()).reason).toBe('permission_denied');
    expect((await registerForPushNotifications()).reason).toBe('permission_denied');
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('un changement de compte pendant la résolution Expo interdit le token en vol', async () => {
    mockResolveToken.mockImplementationOnce(async () => {
      mockState.owner = 'user-b';
      return { data: mockState.token };
    });
    expect((await registerForPushNotifications()).reason).toBe('session_changed');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('annuler au logout interdit la publication encore en vol', async () => {
    mockResolveToken.mockImplementationOnce(async () => {
      cancelPushRegistration();
      return { data: mockState.token };
    });
    expect((await registerForPushNotifications()).reason).toBe('session_changed');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('retire seulement le token du téléphone courant avant déconnexion', async () => {
    await registerForPushNotifications();
    mockRpc.mockClear();
    await unregisterCurrentPushToken();
    expect(mockRpc).toHaveBeenCalledWith('keep_push_token_unregister', { p_token: mockState.token });
  });
});
