import fs from 'fs';
import path from 'path';
const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
const deck = fs.readFileSync(path.resolve(__dirname, '..', 'SwipeDeck.tsx'), 'utf8');

describe('Loki Swipe: one clear navigation action and real audio buffering feedback', () => {
  it('has one NEXT button on both iPhone and PC, but retains upward Swipe', () => {
    expect(modal.match(/testID="swipe-next-without-gesture"/g)).toHaveLength(1);
    expect(modal).not.toContain('testID="desktop-story-next-track"');
    expect(modal).toContain('hint={undefined}');
    expect(modal).toContain('onSwipeUp={() => {');
    expect(deck).toContain("return commitSwipe('UP')");
    expect(modal).toContain('>PASSER</Text>');
    expect(modal).toContain('>ARRÊTER</Text>');
  });

  it('distinguishes resolving a music URL from waiting for audible playback', () => {
    expect(modal).toContain('const [previewStarting, setPreviewStarting] = useState(false);');
    expect(modal).toContain("previewStarting\n      ? 'Chargement audio…'");
    expect(modal).toContain('testID="swipe-audio-loading"');
    expect(modal).toContain('setPreviewStarting(false); recordSwipeListenOnce(current.id, currentSourceProfileId)');
  });

  it('never leaves a spinner when autoplay requires a tap or the preview is unavailable', () => {
    expect(modal).toContain("if (Platform.OS === 'web' && isWebAudioGestureRequired(initialPlayError))");
    expect(modal).toContain("setPreviewStarting(false); setAutoplayBlocked(true)");
    expect(modal).toContain("skipUnavailablePreview('catalog_no_playable_preview')");
    expect(modal).toContain("skipUnavailablePreview('native_preview_play_failed')");
    expect(modal).toContain('setPreviewStarting(false);');
  });
});
