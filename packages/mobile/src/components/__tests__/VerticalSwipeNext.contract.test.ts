import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) =>
  fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('TikTok-style upward swipe contract', () => {
  const deck = read('..', 'SwipeDeck.tsx');
  const modal = read('..', 'MusicSwipeDeckModal.tsx');
  const home = read('..', '..', 'screens', 'HomeScreenCompact.tsx');

  it('supports a real native upward gesture with a lower vertical threshold', () => {
    expect(deck).toContain("export type SwipeDirection = 'LEFT' | 'RIGHT' | 'UP';");
    expect(deck).toContain('const VERTICAL_SWIPE_THRESHOLD = 52;');
    expect(deck).toContain('onMoveShouldSetPanResponderCapture');
    expect(deck).toContain("return commitSwipe('UP')");
  });

  it('maps swipe up to next track in the shared music swipe surface', () => {
    expect(modal).toContain('onSwipeUp={() => {');
    expect(modal).toContain('void advance().finally');
    expect(modal).toContain('upLabel="SUIVANT"');
    expect(modal).toContain('↑ morceau suivant');
  });

  it('maps swipe up to next detected track in Listen too', () => {
    expect(home).toContain('onSwipeUp={canGoOlder ? goOlder : undefined}');
    expect(home).toContain('upLabel="SUIVANT"');
    expect(home).toContain('Swipe facultatif : ↑ suivant');
  });

  it('never makes the gesture mandatory: PASSER, GARDER and ARRÊTER remain visible', () => {
    expect(modal).toContain('>PASSER</Text>');
    expect(modal).toContain("currentAlreadyKept ? '✓ DÉJÀ' : '♡ GARDER'");
    expect(modal).toContain('>ARRÊTER</Text>');
  });
});

describe('écoute complète : seulement après GARDER (Adel 05/10/2026)', () => {
  it('locks the full-listen button for other members\' tracks until they are kept', () => {
    const modal = require('fs').readFileSync(require('path').join(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
    expect(modal).toContain('const fullListenLocked = !previewOnly && (askVisibilityOnKeep || Boolean(currentSourceUsername)) && !currentAlreadyKept;');
    expect(modal).toContain('fullTrackDestination && !fullListenLocked');
    expect(modal).toContain('Écoute complète disponible après GARDER');
  });
});
