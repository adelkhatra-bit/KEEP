const fs = require('fs');
const path = require('path');

describe('silent app update contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'AppUpdateBanner.tsx'), 'utf8');

  it('never renders a user-facing version banner or manual refresh control', () => {
    expect(source).toContain('return null;');
    expect(source).not.toContain('keep-manual-update-control');
    expect(source).not.toContain('ACTUALISER LOKI MUSIC');
    expect(source).not.toContain('NOUVELLE VERSION DISPONIBLE');
    expect(source).not.toContain('METTRE À JOUR');
    expect(source).not.toContain('<TouchableOpacity');
  });

  it('checks web deployment state and applies a newer bundle automatically', () => {
    expect(source).toContain('useAppUpdateStore');
    expect(source).toContain('latestSha');
    expect(source).toContain('void checkNow()');
    expect(source).toContain('setInterval(() => { void checkNow(); }, 60_000)');
    expect(source).toContain('reloadToLatest()');
  });

  it('auto-applies a compatible production OTA on native TestFlight launches', () => {
    expect(source).toContain("await import('expo-updates')");
    expect(source).toContain('Updates.checkForUpdateAsync()');
    expect(source).toContain('Updates.fetchUpdateAsync()');
    expect(source).toContain('Updates.reloadAsync()');
    expect(source).toContain("Platform.OS === 'web' || __DEV__");
  });
});
