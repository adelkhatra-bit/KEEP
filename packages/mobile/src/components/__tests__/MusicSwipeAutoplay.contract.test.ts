// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Loki Music Swipe audio lifecycle', () => {
  const modal = read(__dirname, '..', 'MusicSwipeDeckModal.tsx');
  const profile = read(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx');
  const audio = read(__dirname, '..', '..', 'services', 'audioPreviewService.ts');

  it('unlocks web audio synchronously from the tap that opens the public collection', () => {
    const openSwipe = profile.slice(profile.indexOf('const openProfileSwipe'), profile.indexOf('const switchProfileTab'));
    expect(openSwipe).toContain('unlockWebAudioForGesture();');
    expect(openSwipe.indexOf('unlockWebAudioForGesture();')).toBeLessThan(openSwipe.indexOf('setProfileSwipeOpen(true);'));
    expect(audio).toContain('SILENT_UNLOCK_SOURCE');
    expect(audio).toContain("if (!element.src)");
  });

  it('starts each resolved preview automatically and retains a visible manual fallback', () => {
    expect(modal).toContain('await toggleTrackPreview(');
    expect(modal).toContain('if (isTrackPreviewActive(playbackKey)) return;');
    expect(modal).toContain('setAutoplayBlocked(true)');
    expect(modal).toContain('▶ ÉCOUTER L’EXTRAIT');
  });

  it('invalidates the previous card and stops its audio before advancing', () => {
    expect(modal).toContain('playbackGeneration.current += 1;\n    await stopTrackPreview();\n    advanceIndex();');
    expect(modal).toContain('playbackGeneration.current !== generation');
    expect(audio).toContain('try { webAudio?.pause(); } catch {}');
    expect(audio.indexOf('try { webAudio?.pause(); } catch {}')).toBeLessThan(audio.indexOf('return serialize(async () =>', audio.indexOf('export async function stopTrackPreview')));
  });
});
