jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../micCapture', () => ({ isNativeRecordingModeActive: jest.fn(() => false) }));
jest.mock('../problemReportService', () => ({ reportAutoDiagnostic: jest.fn() }));
jest.mock('expo-av', () => ({
  Audio: {
    setIsEnabledAsync: jest.fn(async () => {}),
    setAudioModeAsync: jest.fn(async () => {}),
    Sound: { createAsync: jest.fn() },
  },
  InterruptionModeIOS: { MixWithOthers: 1, DoNotMix: 2 },
}));

function makeSound() {
  const state = { isLoaded: true, isPlaying: false, isBuffering: false, shouldPlay: false };
  return {
    state,
    getStatusAsync: jest.fn(async () => ({ ...state })),
    playAsync: jest.fn(async () => { state.isPlaying = true; return { ...state }; }),
    pauseAsync: jest.fn(async () => { state.isPlaying = false; }),
    stopAsync: jest.fn(async () => { state.isPlaying = false; }),
    unloadAsync: jest.fn(async () => {}),
    setVolumeAsync: jest.fn(async () => {}),
    setPositionAsync: jest.fn(async () => {}),
    setOnPlaybackStatusUpdate: jest.fn(),
  };
}

describe('démarrage réel des extraits natifs', () => {
  let service: typeof import('../audioPreviewService');
  let audio: any;
  let sound: ReturnType<typeof makeSound>;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    service = jest.requireActual('../audioPreviewService');
    audio = jest.requireMock('expo-av').Audio;
    sound = makeSound();
    audio.Sound.createAsync.mockResolvedValue({ sound });
  });
  afterEach(async () => {
    service.stopTrackPreviewFast();
    service.discardPreloadedTrackPreview();
    await jest.advanceTimersByTimeAsync(3000);
    jest.useRealTimers();
  });

  it('prépare la session native dès le geste sans jouer ni couper le micro', async () => {
    jest.requireMock('../micCapture').isNativeRecordingModeActive.mockReturnValue(true);
    await service.unlockTrackPreviewAudio();
    expect(audio.setIsEnabledAsync).toHaveBeenCalledWith(true);
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsRecordingIOS: true }));
    expect(audio.Sound.createAsync).not.toHaveBeenCalled();
    expect(sound.playAsync).not.toHaveBeenCalled();
  });

  it('débloque Safari synchroniquement dans le geste avant toute promesse', async () => {
    const globals = globalThis as any;
    const previousAudio = globals.Audio;
    const previousDocument = globals.document;
    const element = { src: '', play: jest.fn(async () => {}), pause: jest.fn(), load: jest.fn() };
    globals.Audio = jest.fn(() => element);
    globals.document = {};
    try {
      const unlocking = service.unlockTrackPreviewAudio();
      expect(element.play).toHaveBeenCalledTimes(1);
      expect(element.src).toMatch(/^data:audio\/wav/);
      expect(audio.setIsEnabledAsync).not.toHaveBeenCalled();
      await unlocking;
    } finally {
      globals.Audio = previousAudio;
      globals.document = previousDocument;
    }
  });

  it('active la session même en cache et conserve le mode micro', async () => {
    jest.requireMock('../micCapture').isNativeRecordingModeActive.mockReturnValue(true);
    await service.toggleTrackPreview('first', 'https://example.test/preview', jest.fn());
    const modeCalls = audio.setAudioModeAsync.mock.calls.length;
    await service.toggleTrackPreview('second', 'https://example.test/next', jest.fn());
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(modeCalls);
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsRecordingIOS: true, staysActiveInBackground: true, interruptionModeIOS: 1,
    }));
    expect(audio.setIsEnabledAsync.mock.calls.length).toBeGreaterThan(1);
    expect(audio.setIsEnabledAsync.mock.invocationCallOrder[0]).toBeLessThan(sound.playAsync.mock.invocationCallOrder[0]);
  });

  it('attend loaded puis playing, jamais shouldPlay + buffering', async () => {
    sound.state.isLoaded = false;
    sound.playAsync.mockImplementation(async () => {
      sound.state.shouldPlay = true;
      sound.state.isBuffering = true;
      return { ...sound.state };
    });
    const changed = jest.fn();
    const playing = service.playTrackPreviewSegment('round', 'https://example.test/preview', 0, 10000, changed);
    await jest.advanceTimersByTimeAsync(600);
    expect(sound.playAsync).not.toHaveBeenCalled();
    sound.state.isLoaded = true;
    await jest.advanceTimersByTimeAsync(1600);
    expect(changed).not.toHaveBeenCalledWith(true);
    sound.state.isPlaying = true;
    await jest.advanceTimersByTimeAsync(200);
    await playing;
    expect(changed).toHaveBeenCalledWith(true);
  });

  it('relance réellement une seule fois après un premier démarrage bloqué', async () => {
    sound.playAsync.mockImplementationOnce(async () => ({ ...sound.state }));
    const playing = service.toggleTrackPreview('round', 'https://example.test/preview', jest.fn());
    await jest.advanceTimersByTimeAsync(5500);
    await playing;
    expect(sound.playAsync).toHaveBeenCalledTimes(2);
    expect(sound.pauseAsync).toHaveBeenCalledTimes(1);
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(2);
  });

  it('borne un tamponnage permanent et ne signale pas un succès', async () => {
    sound.playAsync.mockImplementation(async () => ({ ...sound.state }));
    const changed = jest.fn();
    const result = service.toggleTrackPreview('round', 'https://example.test/preview', changed).catch((error) => error);
    await jest.advanceTimersByTimeAsync(12000);
    expect((await result).message).toBe('AUDIO_PREVIEW_NOT_PLAYING');
    expect(sound.playAsync).toHaveBeenCalledTimes(2);
    expect(changed).not.toHaveBeenCalledWith(true);
    expect(sound.unloadAsync).toHaveBeenCalled();
  });

  it('une annulation pendant l’activation ne peut jamais jouer l’ancien extrait', async () => {
    let enable!: () => void;
    audio.setIsEnabledAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { enable = resolve; }));
    const result = service.toggleTrackPreview('old', 'https://example.test/old', jest.fn()).catch((error) => error);
    await jest.advanceTimersByTimeAsync(0);
    service.stopTrackPreviewFast();
    enable();
    await jest.advanceTimersByTimeAsync(100);
    expect((await result).message).toBe('AUDIO_PREVIEW_CANCELLED');
    expect(sound.playAsync).not.toHaveBeenCalled();
  });

  it('décharge un createAsync tardif après son timeout sans autoplay ni fuite', async () => {
    let resolveCreate!: (value: any) => void;
    audio.Sound.createAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const replacement = makeSound();
    audio.Sound.createAsync.mockResolvedValueOnce({ sound: replacement });
    const playing = service.toggleTrackPreview('round', 'https://example.test/preview', jest.fn());
    await jest.advanceTimersByTimeAsync(8400);
    await playing;
    resolveCreate({ sound });
    await jest.advanceTimersByTimeAsync(1000);
    expect(sound.playAsync).not.toHaveBeenCalled();
    expect(sound.unloadAsync).toHaveBeenCalled();
    expect(replacement.playAsync).toHaveBeenCalledTimes(1);
  });

  it('laisse charger un réseau lent au-delà de l’ancienne échéance de 3,2 secondes', async () => {
    audio.Sound.createAsync.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve({ sound }), 4200);
    }));
    const playing = service.toggleTrackPreview('slow', 'https://example.test/slow', jest.fn());
    await jest.advanceTimersByTimeAsync(4500);
    await playing;
    expect(audio.Sound.createAsync).toHaveBeenCalledTimes(1);
    expect(sound.playAsync).toHaveBeenCalledTimes(1);
  });

  it('précharge N+1 pendant N sans jouer ni reconfigurer N et annule les précharges tardives', async () => {
    await service.playTrackPreviewSegment('N', 'https://example.test/current', 0, 10000);
    const next = makeSound();
    let resolveNext!: (value: any) => void;
    audio.Sound.createAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const modeCalls = audio.setAudioModeAsync.mock.calls.length;
    const preload = service.preloadTrackPreviewSegment('N+1', 'https://example.test/next', 0);
    await jest.advanceTimersByTimeAsync(0);
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(modeCalls);
    expect(sound.state.isPlaying).toBe(true);
    service.discardPreloadedTrackPreview();
    resolveNext({ sound: next });
    await jest.advanceTimersByTimeAsync(1000);
    await preload;
    expect(next.playAsync).not.toHaveBeenCalled();
    expect(next.unloadAsync).toHaveBeenCalled();
  });

  it('un préchargement en cours ne bloque pas un autre geste et reste silencieux', async () => {
    await service.playTrackPreviewSegment('N', 'https://example.test/current', 0, 10000);
    const next = makeSound();
    let resolveNext!: (value: any) => void;
    audio.Sound.createAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const preload = service.preloadTrackPreviewSegment('N+1', 'https://example.test/next', 0);
    await jest.advanceTimersByTimeAsync(0);
    const selected = makeSound();
    audio.Sound.createAsync.mockResolvedValueOnce({ sound: selected });
    await service.toggleTrackPreview('selected', 'https://example.test/selected', jest.fn());
    expect(selected.playAsync).toHaveBeenCalledTimes(1);
    resolveNext({ sound: next });
    await preload;
    expect(next.playAsync).not.toHaveBeenCalled();
  });

  it('consomme le préchargement N+1 encore en cours sans créer de lecteur supplémentaire', async () => {
    const next = makeSound();
    let resolveNext!: (value: any) => void;
    audio.Sound.createAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const preload = service.preloadTrackPreviewSegment('N+1', 'https://example.test/next', 0);
    await jest.advanceTimersByTimeAsync(0);
    const playing = service.playTrackPreviewSegment('N+1', 'https://example.test/next', 0);
    resolveNext({ sound: next });
    await preload;
    await playing;
    expect(audio.Sound.createAsync).toHaveBeenCalledTimes(1);
    expect(next.playAsync).toHaveBeenCalledTimes(1);
  });

  it('le listener préchargé ne confirme jamais playing pendant le tamponnage', async () => {
    await service.preloadTrackPreviewSegment('N+1', 'https://example.test/next', 0);
    sound.playAsync.mockImplementation(async () => {
      sound.state.shouldPlay = true;
      sound.state.isBuffering = true;
      return { ...sound.state };
    });
    const changed = jest.fn();
    const playing = service.playTrackPreviewSegment('N+1', 'https://example.test/next', 0, 10000, changed);
    await jest.advanceTimersByTimeAsync(200);
    const onStatus = sound.setOnPlaybackStatusUpdate.mock.calls[0][0];
    onStatus({ ...sound.state, didJustFinish: false });
    expect(changed).toHaveBeenCalledWith(false);
    expect(changed).not.toHaveBeenCalledWith(true);
    expect(jest.requireMock('../problemReportService').reportAutoDiagnostic).not.toHaveBeenCalled();
    sound.state.isPlaying = true;
    sound.state.isBuffering = false;
    onStatus({ ...sound.state, didJustFinish: false });
    await jest.advanceTimersByTimeAsync(200);
    await playing;
    expect(changed).toHaveBeenCalledWith(true);
    expect(jest.requireMock('../problemReportService').reportAutoDiagnostic).toHaveBeenCalledWith(
      'AUDIO_PREVIEW_STARTED', expect.stringMatching(/^native start_ms=\d+$/),
    );
  });

  it('un Battle planifié attend playing et garde la position serveur au réessai', async () => {
    sound.playAsync.mockImplementationOnce(async () => ({ ...sound.state }));
    const changed = jest.fn();
    const target = Date.now() + 500;
    await service.scheduleTrackPreviewSegment('arena', 'https://example.test/preview', 0, 12000, target, changed);
    await jest.advanceTimersByTimeAsync(2000);
    expect(changed).not.toHaveBeenCalledWith(true);
    await jest.advanceTimersByTimeAsync(4000);
    expect(changed).toHaveBeenCalledWith(true);
    const positions = sound.setPositionAsync.mock.calls.map((call: any[]) => call[0]);
    expect(positions[0]).toBeGreaterThanOrEqual(9000);
    expect(positions[1]).toBeGreaterThanOrEqual(14000);
    const diagnostic = jest.requireMock('../problemReportService').reportAutoDiagnostic;
    expect(diagnostic).toHaveBeenCalledWith('AUDIO_PREVIEW_STARTED', expect.stringMatching(/^native start_ms=\d+$/));
  });
});
