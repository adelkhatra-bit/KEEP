jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../micCapture', () => ({ isNativeRecordingModeActive: () => false }));
jest.mock('expo-av', () => {
  const sound = () => {
    let playing = false;
    return {
      getStatusAsync: jest.fn(async () => ({ isLoaded: true, isPlaying: playing, durationMillis: 30000 })),
      playAsync: jest.fn(async () => { playing = true; }),
      stopAsync: jest.fn(async () => { playing = false; }),
      pauseAsync: jest.fn(async () => { playing = false; }),
      unloadAsync: jest.fn(async () => {}),
      setPositionAsync: jest.fn(async () => {}),
      setVolumeAsync: jest.fn(async () => {}),
      setOnPlaybackStatusUpdate: jest.fn(),
    };
  };
  return { InterruptionModeIOS: { DoNotMix: 1, MixWithOthers: 2 }, InterruptionModeAndroid: { DoNotMix: 1 }, Audio: {
    setAudioModeAsync: jest.fn(async () => {}),
    Sound: { createAsync: jest.fn(async () => ({ sound: sound() })) },
    InterruptionModeIOS: { DoNotMix: 1 }, InterruptionModeAndroid: { DoNotMix: 1 },
  } };
});

import { Audio } from 'expo-av';
import { playTrackPreviewSegment, preloadTrackPreviewSegment, scheduleTrackPreviewSegment, stopTrackPreview } from '../audioPreviewService';

describe('Battle audio : vrais appels expo-av, sans délai 12 secondes', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(async () => { await stopTrackPreview(); jest.useRealTimers(); });
  async function complete(operation: Promise<void>) {
    const handled = operation.then(() => ({ error: null }), (error) => ({ error }));
    await jest.advanceTimersByTimeAsync(350);
    const result = await handled;
    if (result.error) throw result.error;
  }
  it.each([0, 12000, 20000])('Solo et retry démarrent immédiatement à %s ms', async (position) => {
    await complete(playTrackPreviewSegment(`solo-${position}`, 'https://audio.test/clip', position, 10000, undefined, undefined, true));
    expect(Audio.Sound.createAsync).toHaveBeenLastCalledWith(
      { uri: 'https://audio.test/clip' },
      expect.objectContaining({ positionMillis: position, shouldPlay: false }),
      expect.any(Function),
    );
    const results = (Audio.Sound.createAsync as jest.Mock).mock.results;
    const created = await results[results.length - 1].value;
    expect(created.sound.playAsync).toHaveBeenCalled();
  });
  it('précharge et consomme le même offset zéro, sans repli implicite 9 secondes', async () => {
    await complete(preloadTrackPreviewSegment('zero-preload', 'https://audio.test/zero', 0, true));
    await complete(playTrackPreviewSegment('zero-preload', 'https://audio.test/zero', 0, 10000, undefined, undefined, true));
    expect(Audio.Sound.createAsync).toHaveBeenCalledTimes(1);
    expect((Audio.Sound.createAsync as jest.Mock).mock.calls[0][1].positionMillis).toBe(0);
  });
  it('la lecture online en retard reprend à 12 secondes + retard, pas au début', async () => {
    const start = Date.now() - 1500;
    await complete(scheduleTrackPreviewSegment('late', 'https://audio.test/late', 12000, 10000, start, undefined, true));
    const results = (Audio.Sound.createAsync as jest.Mock).mock.results;
    const created = await results[results.length - 1].value;
    expect(created.sound.setPositionAsync).toHaveBeenCalledWith(expect.any(Number));
    const calls = created.sound.setPositionAsync.mock.calls;
    const position = calls[calls.length - 1][0];
    expect(position).toBeGreaterThanOrEqual(13500);
    expect(position).toBeLessThan(14500);
    expect(created.sound.playAsync).toHaveBeenCalled();
  });
  it('Web : offset zéro et rattrapage 12s suivent la même règle que le natif', async () => {
    const elements: any[] = [];
    class HtmlAudio {
      src = '';
      readyState = 4;
      duration = 30;
      currentTime = 0;
      paused = true;
      play = jest.fn(async () => { this.paused = false; });
      pause = jest.fn(() => { this.paused = true; });
      load = jest.fn();
      addEventListener = jest.fn();
      removeEventListener = jest.fn();
      constructor() { elements.push(this); }
    }
    (globalThis as any).Audio = HtmlAudio;
    (globalThis as any).document = {};
    try {
      await complete(playTrackPreviewSegment('web-zero', 'https://audio.test/web', 0, 10000, undefined, undefined, true));
      expect(elements[0].currentTime).toBe(0);
      expect(elements[0].play).toHaveBeenCalled();
      await complete(scheduleTrackPreviewSegment('web-late', 'https://audio.test/web', 12000, 10000, Date.now() - 1800, undefined, true));
      expect(elements[0].currentTime).toBeGreaterThanOrEqual(13.8);
      expect(elements[0].currentTime).toBeLessThan(14.8);
      expect(Audio.Sound.createAsync).not.toHaveBeenCalled();
    } finally {
      await stopTrackPreview();
      delete (globalThis as any).Audio;
      delete (globalThis as any).document;
    }
  });
});
