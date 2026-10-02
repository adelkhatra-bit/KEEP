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
});
