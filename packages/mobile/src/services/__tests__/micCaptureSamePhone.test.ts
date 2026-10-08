jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn(() => ({ exists: true, size: 2000 })) }));
jest.mock('../backgroundListeningService', () => ({ ensureBackgroundListeningService: jest.fn(), stopBackgroundListeningService: jest.fn() }));
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    setAudioModeAsync: jest.fn(async () => {}),
    RecordingOptionsPresets: { HIGH_QUALITY: { ios: {}, android: {} } },
    Recording: { createAsync: jest.fn() },
  },
  InterruptionModeIOS: { MixWithOthers: 0 },
}));

import { Audio, InterruptionModeIOS } from 'expo-av';
import { captureAudioSample } from '../micCapture';

describe('reconnaissance sur le même iPhone', () => {
  const recording = { stopAndUnloadAsync: jest.fn(async () => {}), getURI: () => 'file:///sample.m4a' };
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());
  const capture = async (metering?: number) => {
    (Audio.Recording.createAsync as jest.Mock).mockImplementation(async (_, onStatus) => {
      onStatus(metering === undefined ? {} : { metering });
      return { recording };
    });
    const result = captureAudioSample(undefined, 2500);
    // Installer immédiatement le gestionnaire de rejet avant d'avancer l'horloge.
    const settled = result.then((value) => ({ value, error: null }), (error: Error) => ({ value: null, error }));
    await jest.advanceTimersByTimeAsync(2500);
    return settled;
  };
  it('configure le mixage avant de démarrer la capture, sans ducking', async () => {
    expect((await capture(-30)).error).toBeNull();
    expect(Audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecordingIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      shouldDuckAndroid: false,
    }));
    expect((Audio.setAudioModeAsync as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((Audio.Recording.createAsync as jest.Mock).mock.invocationCallOrder[0]);
  });
  it('libère le micro et explique le repli au lieu d’envoyer du silence', async () => {
    const { error } = await capture(-160);
    expect(recording.stopAndUnloadAsync).toHaveBeenCalledTimes(1);
    expect(error?.message).toContain('Lance la musique sur un autre appareil');
  });
  it('ne rejette pas une musique faible sous le seuil de l’animation', async () => {
    expect((await capture(-55)).error).toBeNull();
  });
  it('ne conclut pas au silence quand l’appareil ne fournit pas le niveau micro', async () => {
    expect((await capture()).error).toBeNull();
  });
});
