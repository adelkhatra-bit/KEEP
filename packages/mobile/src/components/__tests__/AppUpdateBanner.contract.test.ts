const fs = require('fs');
const path = require('path');

describe('silent app update contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'AppUpdateBanner.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
  const updateStore = fs.readFileSync(path.join(__dirname, '..', '..', 'store', 'useAppUpdateStore.ts'), 'utf8');

  it('never renders a user-facing version banner or manual refresh control', () => {
    expect(source).toContain('return null;');
    expect(source).not.toContain('keep-manual-update-control');
    expect(source).not.toContain('ACTUALISER LOKI MUSIC');
    expect(source).not.toContain('NOUVELLE VERSION DISPONIBLE');
    expect(source).not.toContain('METTRE À JOUR');
    expect(source).not.toContain('<TouchableOpacity');
  });

  it('waits for auth bootstrap, then checks web deployment state and applies a newer bundle automatically', () => {
    expect(source).toContain('authReady');
    expect(source).toContain("if (!authReady || Platform.OS !== 'web') return undefined;");
    expect(source).toContain('useAppUpdateStore');
    expect(source).toContain('latestSha');
    expect(source).toContain('void checkNow()');
    expect(source).toContain('setInterval(() => { void checkNow(); }, 60_000)');
    expect(source).toContain('reloadToLatest()');
    expect(source).toContain("if (!authReady || Platform.OS !== 'web' || !latestSha || webReloadingRef.current) return undefined;");
    // Jamais de rechargement sous les doigts : seulement onglet en arrière-plan.
    expect(source).toContain("document.visibilityState === 'hidden'");
    expect(source).toContain("document.addEventListener('visibilitychange', onHidden)");
  });

  it('cannot be blocked by a legacy dismissed-update SHA', () => {
    expect(updateStore).not.toContain('keep_dismissed_update_sha');
    expect(updateStore).not.toContain('readDismissedSha');
    expect(updateStore).not.toContain('writeDismissedSha');
    expect(updateStore).toContain('if (latest && latest !== current)');
  });

  it('deduplicates concurrent auth restoration and does not block on secondary syncs', () => {
    expect(app).toContain('inFlightSessionPromise');
    expect(app).toContain('handleSessionOnce');
    expect(app).toContain('post-auth sync unavailable');
    expect(app.indexOf('useUserStore.getState().setUser(profile)')).toBeLessThan(app.indexOf('syncUnsyncedKeeps()'));
  });

  it('auto-applies a compatible production OTA on native TestFlight launches', () => {
    expect(source).toContain("await import('expo-updates')");
    expect(source).toContain('Updates.checkForUpdateAsync()');
    expect(source).toContain('Updates.fetchUpdateAsync()');
    expect(source).toContain('Updates.reloadAsync()');
    expect(source).toContain("!authReady || Platform.OS === 'web' || __DEV__");
  });
});
