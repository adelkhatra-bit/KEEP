import fs from 'fs';
import path from 'path';

const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
const deck = fs.readFileSync(path.resolve(__dirname, '..', 'SwipeDeck.tsx'), 'utf8');
const audio = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'audioPreviewService.ts'), 'utf8');

describe('Swipe iPhone: gesture arbitration, clear next action and real audio status', () => {
  it('keeps horizontal and vertical gestures separate from the parent responder', () => {
    expect(modal).not.toContain('onMoveShouldSetPanResponderCapture: (_, g) => !screenSwipeRef.current.locked');
    expect(modal).toContain('onMoveShouldSetPanResponder: (_, g) => !screenSwipeRef.current.locked && g.dy < -14');
    expect(modal).toContain('onShouldBlockNativeResponder: () => false');
    expect(modal).toContain('onPanResponderTerminationRequest: () => true');
    expect(modal).toContain('.failOffsetX([-8, 8])');
    expect(deck).toContain("return commitSwipe('LEFT')");
    expect(deck).toContain("return commitSwipe('RIGHT')");
    expect(deck).toContain("return commitSwipe('UP')");
  });

  it('keeps the card free of a Next button (Adel 17/10/2026, #214): swipe up on iPhone, aside button on PC', () => {
    expect(modal).not.toContain('testID="swipe-next-without-gesture"');
    expect(modal).toContain('testID="desktop-story-next-track"');
    expect(modal).toMatch(/hint=\{swipeHint\}\s+fill/);
    expect(modal).toContain('upLabel="SUIVANT"');
    expect(modal).toContain('>PASSER</Text>');
    expect(modal).toContain('>ARRÊTER</Text>');
  });

  it('shows buffering and makes retry available on iPhone as well as web', () => {
    expect(modal).toContain('const [previewStarting, setPreviewStarting] = useState(false);');
    expect(modal).toContain('Chargement audio…');
    expect(modal).toContain('testID="swipe-audio-loading"');
    expect(modal).toContain('{(autoplayBlocked || previewEnded) && resolvedPreviewUrl ?');
    expect(modal).toContain('setPreviewStarting(false);');
    expect(audio).toContain('stalled = isPreviewStillStalled(status);');
    const start = audio.indexOf('stalled = isPreviewStillStalled(status);');
    const watchdog = audio.slice(start, start + 600);
    expect(watchdog).toContain('onStateChange(false);');
    expect(watchdog).not.toContain('onEnded?.();');
  });
});
