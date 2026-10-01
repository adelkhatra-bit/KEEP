const fs = require('fs');
const path = require('path');

describe('web update control contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'AppUpdateBanner.tsx'), 'utf8');

  it('never renders the desktop update control on mobile-width screens', () => {
    expect(source).toContain("width < 768");
    expect(source).toContain("if (Platform.OS !== 'web' || width < 768) return null;");
  });

  it('keeps a large manual refresh control permanently visible on desktop web', () => {
    expect(source).toContain('testID="keep-manual-update-control"');
    expect(source).toContain('ACTUALISER LOKI MUSIC');
    expect(source).toContain('NOUVELLE VERSION DISPONIBLE');
    expect(source).toContain('width: 340');
    expect(source).toContain('minHeight: 68');
    expect(source).toContain('fontSize: 14.5');
  });

  it('checks for a newer SHA and always performs a cache-busted reload on click', () => {
    expect(source).toContain('checkNow().finally(reloadToLatest)');
    expect(source).toContain('setInterval(() => { void checkNow(); }, 60_000)');
  });

  it('auto-applies the latest production OTA on native TestFlight launches', () => {
    expect(source).toContain("import * as Updates from 'expo-updates'");
    expect(source).toContain('Updates.checkForUpdateAsync()');
    expect(source).toContain('Updates.fetchUpdateAsync()');
    expect(source).toContain('Updates.reloadAsync()');
    expect(source).toContain("Platform.OS === 'web' || __DEV__ || !Updates.isEnabled");
  });
});
