import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', name), 'utf8');

describe('Web animation driver contract', () => {
  it.each(['MotionActionButton.tsx', 'BattleGlowButton.tsx', 'PresenceDot.tsx'])('%s disables native driver on web', (name) => {
    const source = read(name);
    expect(source).toContain("Platform.OS !== 'web'");
    expect(source).not.toContain('useNativeDriver: true');
  });
});
