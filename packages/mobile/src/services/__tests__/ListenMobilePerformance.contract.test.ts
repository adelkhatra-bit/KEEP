import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Listen mobile swipe performance contract', () => {
  const home = read('..', 'HomeScreenCompact.tsx');
  const swipe = read('..', '..', 'components', 'SwipeDeck.tsx');
  const audio = read('..', 'audioPreviewService.ts');

  it('swipe up only browses to the next detected track and never records PASSER', () => {
    expect(home).toContain('onSwipeUp={canGoOlder ? goOlder : undefined}');
    expect(home).not.toContain('onSwipeUp={() => { if (current && pending) passTrack(current.id); }}');
  });

  it('PASSER advances the UI before persisting the local decision', () => {
    const start = home.indexOf('const passCurrent = () => {');
    const next = home.indexOf('setViewedTrackId(nextTrackId);', start);
    const pass = home.indexOf('passTrack(current.id);', start);
    expect(start).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(start);
    expect(pass).toBeGreaterThan(next);
    expect(home).toContain('onSwipeLeft={pending ? passCurrent : undefined}');
    expect(home).toContain('onPress={passCurrent}');
  });

  it('accepts a short upward flick for TikTok-style navigation', () => {
    expect(swipe).toContain('VERTICAL_FLICK_VELOCITY');
    expect(swipe).toContain('gesture.vy <= VERTICAL_FLICK_VELOCITY');
  });

  it('preloads the next native audio without resetting the active iOS audio session', () => {
    expect(audio).toContain('configureSession = true');
    expect(audio).toContain('const sound = await createSoundWithRetry(previewUrl, effectivePosition, () => {}, false, !activePlaying);');
    expect(audio).toContain('if (!activePlaying) await configurePreviewAudio();');
  });
});
