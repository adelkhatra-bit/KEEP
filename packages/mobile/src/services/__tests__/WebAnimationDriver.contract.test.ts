import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', name), 'utf8');

describe('Web animation driver contract', () => {
  it.each(['MotionActionButton.tsx', 'BattleGlowButton.tsx', 'PresenceDot.tsx', 'SwipeDeck.tsx', 'AccountGateModal.tsx', 'ListenEnergyAura.tsx', 'GlobalNotificationBanner.tsx', 'KeepBattleMobileGameV3.tsx'])('%s disables native driver on web', (name) => {
    const source = read(name);
    expect(source).toContain("Platform.OS !== 'web'");
    expect(source).not.toContain('useNativeDriver: true');
  });
});


it('Listen screen disables native driver on web', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
  expect(source).toContain("Platform.OS !== 'web'");
  expect(source).not.toContain('useNativeDriver: true');
});
