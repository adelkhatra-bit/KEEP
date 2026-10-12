import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Desktop Battle cockpit, without changing iOS gameplay', () => {
  const parties = read('packages/mobile/src/screens/PartiesScreen.tsx');
  const game = read('packages/mobile/src/components/KeepBattleMobileGameV3.tsx');

  it('uses real PC space, not another 430px mobile shell', () => {
    expect(parties).toContain('testID="desktop-battle-stage"');
    expect(parties).toContain('testID="desktop-battle-left"');
    expect(parties).toContain('testID="desktop-battle-right"');
    expect(game).toContain('const desktopGameWidth = Math.min(580, Math.max(430, Math.floor(windowWidth * 0.48)));');
    expect(game).toContain('rootDesktop: { maxWidth: 580');
    expect(game).toContain('const battleDesignWidth = Math.min(windowWidth, 430);');
  });

  it('makes desktop side panel actionable without routing out of a live Battle', () => {
    expect(parties).toContain('accessibilityLabel="Voir le classement Battle sans quitter le jeu"');
    expect(parties).toContain('setLeaderboardOpen(true); setBattleSummaryOpen(true);');
    expect(parties).toContain('desktopBattleLeaderboardButton');
    expect(parties).not.toContain('testID="desktop-battle-right" pointerEvents="none"');
    expect(parties).toContain('onExit={() => { setBattleOpen(false);');
  });

  it('keeps the same 8/15/20/30 rules and all four answers', () => {
    expect(game).toContain('const ROUND_COUNT_OPTIONS = [8, 15, 20, 30] as const;');
    expect(game).toContain('testID="battle-solo-answers"');
    expect(game).toContain('testID="battle-solo-artwork-square"');
    expect(game).toContain('s.rootDesktop');
  });
});
