import fs from 'fs';
import path from 'path';

const audio = fs.readFileSync(path.resolve(__dirname, '..', 'audioPreviewService.ts'), 'utf8').replace(/\r\n/g, '\n');
const swipe = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8').replace(/\r\n/g, '\n');
const battle = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Single native playback + fast handoff contract', () => {
  it('silences retiring native audio before the next preview becomes audible', () => {
    expect(audio).toContain('nativeHandoffSilenceBarrier');
    expect(audio).toContain('retireNativeSoundFast(sound)');
    expect(audio).toContain("sound.setVolumeAsync(0)");
    expect(audio).toContain('await awaitNativeHandoffSilence()');
    expect(audio).toContain('playbackRequestEpoch += 1');
  });

  it('keeps a registry of every native sound so orphan players cannot overlap after PASSER', () => {
    expect(audio).toContain('const nativeSoundRegistry = new Set<NativeSound>();');
    expect(audio).toContain('nativeSoundRegistry.add(created.sound);');
    expect(audio).toContain('retireEveryNativeSoundExcept(sound);');
    expect(audio).toContain('retireEveryNativeSoundExcept(null);');
    expect(audio).toContain('forgetNativeSound(sound);');
  });

  it('applies the single-player guard to synchronized Battle starts too', () => {
    expect(audio).toContain('retireEveryNativeSoundExcept(createdSound);');
    expect(audio).toContain('await awaitNativeHandoffSilence();');
  });

  it('loads Battle previews silently before handoff instead of autoplaying during creation', () => {
    expect(audio).toContain('createSoundWithRetry(previewUrl, effectivePosition, onStatus, false)');
    expect(audio).toContain('await ensurePlaying(createdSound)');
  });

  it('blocks duplicate PASSER/swipe-up transitions synchronously', () => {
    expect(swipe).toContain('if (!current || processing || actionInFlight.current) return;');
    expect(swipe).toContain('if (controlsLocked || actionInFlight.current) return;');
  });

  it('resolves the next Swipe preview while the current track starts', () => {
    expect(swipe).toContain('const nextPreviewPromise: Promise<string | null>');
    expect(swipe).toContain('void nextPreviewPromise');
    expect(swipe).toContain('preloadTrackPreview(nextUrl)');
  });

  it('keeps Solo result transition short and preloads the next round', () => {
    expect(battle).toContain('const SOLO_RESULT_HOLD_MS = 650;');
    expect(battle).toContain('void preloadTrackPreviewSegment(');
    expect(battle).toContain('stopTrackPreviewFast();');
  });
});
