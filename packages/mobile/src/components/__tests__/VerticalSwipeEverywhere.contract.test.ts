import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Loki vertical swipe contract', () => {
  const deck = read('..', 'SwipeDeck.tsx');
  const modal = read('..', 'MusicSwipeDeckModal.tsx');
  const home = read('..', '..', 'screens', 'HomeScreenCompact.tsx');

  it('supports a TikTok-like upward gesture in the shared deck', () => {
    expect(deck).toContain("export type SwipeDirection = 'LEFT' | 'RIGHT' | 'UP'");
    expect(deck).toContain("gesture.dy <= -VERTICAL_SWIPE_THRESHOLD");
    expect(deck).toContain("return commitSwipe('UP')");
    expect(deck).toContain("upLabel = 'SUIVANT'");
  });

  it('maps upward swipe to next track in discovery/Pulse', () => {
    expect(modal).toContain('onSwipeUp={() => {');
    expect(modal).toContain('void advance().finally');
    expect(modal).toContain('upLabel="SUIVANT"');
  });

  it('maps upward swipe to the next detected track in Listen while keeping buttons', () => {
    expect(home).toContain('onSwipeUp={canGoOlder ? goOlder : undefined}');
    expect(home).toContain('hint="↑ suivant · ← passer · fiche →"');
    expect(home).toContain('rightLabel="FICHE"');
    expect(home).toContain('accessibilityLabel="Pas la bonne"');
    expect(home).toContain('accessibilityLabel="Passer ce morceau"');
    expect(home).toContain('accessibilityLabel="Garder ce morceau"');
  });
});
