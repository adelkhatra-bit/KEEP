const mockReadClipboard = jest.fn();
const mockNativeModules: Record<string, any> = {};
const mockPlatform = { OS: 'ios' };
jest.mock('react-native', () => ({
  NativeModules: mockNativeModules, Platform: mockPlatform, Linking: {}, Share: {},
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: () => mockReadClipboard() }));
jest.mock('../../utils/keepAlert', () => ({ Alert: {} }));
jest.mock('../../store/useUserStore', () => ({ useUserStore: { getState: () => ({}) } }));
jest.mock('../planService', () => ({ loadCurrentPlanCode: jest.fn() }));
jest.mock('../entitlementService', () => ({ hasFeature: jest.fn() }));
jest.mock('../supabaseClient', () => ({ supabase: null }));
jest.mock('../referralService', () => ({ appendReferralToLink: jest.fn(), loadMyReferralCode: jest.fn() }));

import { readClipboardText } from '../sharingService';

describe('Presse-papiers natif officiel SDK54', () => {
  beforeEach(() => {
    mockPlatform.OS = 'ios';
    delete mockNativeModules.Clipboard;
    delete mockNativeModules.RNCClipboard;
    mockReadClipboard.mockReset();
  });
  it.each(['ios', 'android'])('lit automatiquement sans clavier sur %s via ExpoClipboard', async (platform) => {
    mockPlatform.OS = platform;
    mockReadClipboard.mockResolvedValue('https://open.spotify.com/track/a');
    await expect(readClipboardText()).resolves.toBe('https://open.spotify.com/track/a');
    expect(mockReadClipboard).toHaveBeenCalledTimes(1);
  });
  it('préserve le helper natif historique quand disponible', async () => {
    mockNativeModules.RNCClipboard = { getString: jest.fn(async () => 'legacy') };
    await expect(readClipboardText()).resolves.toBe('legacy');
    expect(mockReadClipboard).not.toHaveBeenCalled();
  });
  it('ne casse pas les anciens binaires et indique une vraie alternative', async () => {
    mockReadClipboard.mockRejectedValue(new Error('ExpoClipboard native module unavailable'));
    await expect(readClipboardText()).rejects.toThrow('Mets Loki Music à jour ou utilise Partager');
  });
});
