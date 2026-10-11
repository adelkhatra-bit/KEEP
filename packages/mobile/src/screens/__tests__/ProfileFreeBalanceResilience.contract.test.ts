// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('profile FREE balance resilience', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');

  it('keeps the authoritative FREE balance independent from secondary daily stats', () => {
    expect(profile).toContain('loadMyKeepBattleCreditStatus().catch(() => null)');
    expect(profile).toContain('loadKeepBattlePlayerStats(user.id).catch(() => null)');
    expect(profile).toContain('loadFreeSpentToday().catch(() => null)');
    expect(profile).toContain('if (battleStatus) setFreeBalance(battleStatus.remainingFree)');
    expect(profile).toContain("freeBalance ?? '…'");
  });

  it('keeps FREE immediately after Reprises in the primary metrics bar', () => {
    const repris = profile.indexOf('>Reprises</Text>');
    const free = profile.indexOf('>FREE</Text>', repris);
    expect(repris).toBeGreaterThan(-1);
    expect(free).toBeGreaterThan(repris);
  });
});
