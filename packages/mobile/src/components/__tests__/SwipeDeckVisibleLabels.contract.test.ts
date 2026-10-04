// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'SwipeDeck.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('SwipeDeck visible decision labels', () => {
  it('keeps the canonical music decision labels PASSER / GARDER', () => {
    expect(source).toContain("leftLabel = 'PASSER'");
    expect(source).toContain("rightLabel = 'GARDER'");
    expect(source).not.toContain("rightLabel = 'Loki Music'");
  });
  it('keeps TikTok-style upward swipe as an optional next-track gesture', () => {
    expect(source).toContain("export type SwipeDirection = 'LEFT' | 'RIGHT' | 'UP'");
    expect(source).toContain('onSwipeUp?: () => void | Promise<void>;');
    expect(source).toContain("upLabel = 'SUIVANT'");
    expect(source).toContain("return commitSwipe('UP')");
    expect(source).toContain('gesture.dy <= -VERTICAL_SWIPE_THRESHOLD');
    expect(source).toContain('gesture.vy <= VERTICAL_FLING_VELOCITY');
  });

});
