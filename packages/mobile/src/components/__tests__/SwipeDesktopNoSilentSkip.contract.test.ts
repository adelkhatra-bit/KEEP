import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(root, relative), 'utf8');
const deck = read('components/MusicSwipeDeckModal.tsx');
const audio = read('services/audioPreviewService.ts');
const clamped = read('components/ClampedText.tsx');

describe('all users, iPhone and desktop: unavailable audio is not a listener decision', () => {
  test('iOS stalled buffering never fires onEnded or jumps to next song', () => {
    const start = audio.indexOf('previewProgressTimer = setTimeout(');
    expect(start).toBeGreaterThan(0);
    const watchdog = audio.slice(start, start + 1150);
    expect(watchdog).toContain('isPreviewStillStalled(status)');
    expect(watchdog).toContain('stopTrackPreviewFast(key)');
    expect(watchdog).toContain('onStateChange(false)');
    expect(watchdog).not.toContain('onEnded?.()');
  });

  test('a missing catalog snippet does not skip the card at 220 or 450 ms', () => {
    const start = deck.indexOf('const skipUnavailablePreview = ');
    const end = deck.indexOf('if (!visible || preparingDeck || !current)', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const fallback = deck.slice(start, end);
    expect(fallback).toContain('STORY_PREVIEW_NO_AD_FREE_AUDIO');
    expect(fallback).toContain('SWIPE_PREVIEW_UNAVAILABLE');
    expect(fallback).toContain('setPreviewEnded(true)');
    expect(fallback).not.toContain('advanceIndex()');
    expect(fallback).not.toContain('}, 450)');
    expect(deck).not.toContain('}, 220);');
  });

  test('source-only provider iframe never guesses a timed completion', () => {
    const start = deck.indexOf('const scheduleEmbeddedStoryNext = () =>');
    expect(start).toBeGreaterThan(0);
    const block = deck.slice(start, deck.indexOf('const skipUnavailablePreview', start));
    expect(block).not.toContain('30000');
    expect(block).not.toContain('advanceIndex()');
    expect(block).toContain('return;');
  });

  test('the audio retry button exists on BOTH iPhone and web', () => {
    expect(deck).toContain('testID="swipe-retry-audio"');
    expect(deck).toContain('{(autoplayBlocked || previewEnded) && resolvedPreviewUrl ? (');
    expect(deck).not.toContain("Platform.OS === 'web' && (autoplayBlocked || previewEnded)");
    expect(deck).toContain('unlockWebAudioForGesture()');
  });
});

describe('desktop immersive Swipe: artwork visible, action hierarchy compact', () => {
  test('three reaction bubbles stay in the HEADER, never a bulky row above the cover', () => {
    expect(deck).toContain('const feedbackBar =');
    expect(deck).toContain('{desktopSwipeLayout ? feedbackBar : null}');
    expect(deck).toContain('{!desktopSwipeLayout ? feedbackBar : null}');
    expect(deck).toContain('testID="deck-like-bar"');
  });

  test('two big actions rather than repeating Stop and Next in every section', () => {
    expect(deck).toContain('{!desktopSwipeLayout ? <TouchableOpacity style={[s.decisionButton, s.backDecisionButton]}');
    expect(deck).toContain('{!desktopSwipeLayout ? <TouchableOpacity testID="swipe-next-without-gesture"');
    expect(deck).toContain('testID="desktop-story-next-track"');
    expect(deck).toContain("renderStoryAdd('desktop')");
    expect(deck).toContain("desktop ? '＋ STORY'");
  });

  test('discoverer name is short and placed outside the record cover', () => {
    expect(deck).toContain('testID="desktop-short-discoverer"');
    expect(deck).toContain(' · PROFIL');
    expect(deck).toContain('testID="swipe-artwork-stage"');
    expect(deck).toContain('testID="swipe-metadata-below-artwork"');
    expect(deck).toContain("desktopPlayer:{");
    expect(deck).toContain("width:690");
  });

  test('expanding any explanation uses Plus and keeps an accessible label', () => {
    expect(clamped).toContain("{open ? 'Moins' : 'Plus'}");
    expect(clamped).toContain("accessibilityLabel={open ? 'Réduire le texte' : 'En savoir plus'}");
  });
});
