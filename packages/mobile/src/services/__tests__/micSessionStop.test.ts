jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../backgroundListeningService', () => ({ ensureBackgroundListeningService: jest.fn(), stopBackgroundListeningService: jest.fn() }));
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    RecordingOptionsPresets: { HIGH_QUALITY: { android: {}, ios: {} } },
    Recording: { createAsync: jest.fn() },
  },
  InterruptionModeIOS: { MixWithOthers: 0 },
}));

import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError } from '../micCapture';

it('SESSION attend un getUserMedia pendant puis ferme le flux reçu', async () => {
  let acquire!: (stream: any) => void;
  const stop = jest.fn();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    mediaDevices: { getUserMedia: () => new Promise((resolve) => { acquire = resolve; }) },
  } });
  const capture = captureAudioSample().catch((error) => error);
  let stopped = false;
  const cancelling = cancelAudioCapture().then(() => { stopped = true; });
  await Promise.resolve();
  expect(stopped).toBe(false);
  acquire({ active: true, getTracks: () => [{ stop }] });
  await cancelling;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(await capture).toBeInstanceOf(MicCaptureCancelledError);
});

it('SESSION attend createAsync natif puis décharge le nouvel enregistrement', async () => {
  (Platform as any).OS = 'ios';
  let acquire!: (recording: any) => void;
  const stopAndUnloadAsync = jest.fn().mockResolvedValue(undefined);
  (Audio.Recording.createAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { acquire = resolve; }));
  const capture = captureAudioSample().catch((error) => error);
  for (let i = 0; i < 20 && !acquire; i++) await Promise.resolve();
  expect(acquire).toBeDefined();
  let stopped = false;
  const cancelling = cancelAudioCapture().then(() => { stopped = true; });
  await Promise.resolve();
  expect(stopped).toBe(false);
  acquire({ recording: { stopAndUnloadAsync } });
  await cancelling;
  expect(stopAndUnloadAsync).toHaveBeenCalledTimes(1);
  expect(await capture).toBeInstanceOf(MicCaptureCancelledError);
  (Platform as any).OS = 'web';
});

it('une ancienne annulation ne désactive pas une nouvelle capture native', async () => {
  (Platform as any).OS = 'ios';
  (Audio.setAudioModeAsync as jest.Mock).mockClear();
  let acquire!: (recording: any) => void;
  (Audio.Recording.createAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { acquire = resolve; }));
  const oldStop = cancelAudioCapture();
  const capture = captureAudioSample().catch((error) => error);
  await oldStop;
  for (let i = 0; i < 20 && !acquire; i++) await Promise.resolve();
  expect(Audio.setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecordingIOS: true }));
  const newStop = cancelAudioCapture();
  acquire({ recording: { stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined) } });
  await newStop;
  expect(await capture).toBeInstanceOf(MicCaptureCancelledError);
  (Platform as any).OS = 'web';
});
