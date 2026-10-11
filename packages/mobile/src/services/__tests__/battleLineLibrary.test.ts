import { battleLineCombinationCount, composeBattleLine, type BattleLineKind } from '../battleHomeInfo';

const KINDS: BattleLineKind[] = ['WIN_SPEED', 'WIN_ACCURACY', 'LOSE_SPEED', 'LOSE_ACCURACY', 'NOBODY'];

describe('phrases de fin de Battle composées (Adel 05/10/2026)', () => {
  it('is stable for one result and varies a lot across results', () => {
    for (const kind of KINDS) {
      expect(composeBattleLine(kind, 'arena-1:1')).toBe(composeBattleLine(kind, 'arena-1:1'));
      const lines = new Set(Array.from({ length: 200 }, (_, i) => composeBattleLine(kind, `arena-${i}:${i}`)));
      expect(lines.size).toBeGreaterThan(40);
    }
  });
  it('offers thousands of combinations per outcome and a dedicated "nobody won" outcome', () => {
    for (const kind of KINDS) expect(battleLineCombinationCount(kind)).toBeGreaterThan(250);
    expect(composeBattleLine('NOBODY', 'x')).not.toMatch(/gagn[ée] ce Battle|remporte/i);
  });
});
