// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\\r\\n/g, '\\n');

describe('silent deployment update contract', () => {
  const banner = read(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx');
  const app = read(__dirname, '..', '..', '..', 'App.tsx');
  const service = read(__dirname, '..', '..', 'services', 'appUpdateService.ts');
  const workflow = read(__dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'web-preview-pages.yml');

  it('never shows a manual Loki Music update control or version banner', () => {
    expect(banner).toContain('return null;');
    expect(banner).not.toContain('keep-manual-update-control');
    expect(banner).not.toContain('NOUVELLE VERSION DISPONIBLE');
    expect(banner).not.toContain('METTRE À JOUR');
    expect(banner).not.toContain('PLUS TARD');
  });

  it('waits for auth bootstrap before checking or reloading web', () => {
    expect(app).toContain('<AppUpdateBanner authReady={authReady} />');
    expect(app).toContain('authReady ? (user ? <Navigation /> : <OnboardingScreen />)');
    expect(banner).toContain("if (!authReady || Platform.OS !== 'web') return undefined;");
    expect(banner).toContain("if (!authReady || Platform.OS !== 'web' || !latestSha || webReloadingRef.current) return undefined;");
    expect(banner).toContain("document.addEventListener('visibilitychange', onHidden)");
    expect(banner).toContain('setInterval(() => { void checkNow(); }, 60_000)');
  });

  it('keeps automatic cache-busted web refresh available', () => {
    expect(banner).toContain('latestSha');
    expect(banner).toContain('reloadToLatest()');
    expect(service).toContain("params.set('__keep_update'");
    expect(service).toContain('window.location.replace');
  });

  it('auto-applies a compatible production OTA after auth bootstrap', () => {
    expect(banner).toContain("!authReady || Platform.OS === 'web' || __DEV__");
    expect(banner).toContain("await import('expo-updates')");
    expect(banner).toContain('Updates.checkForUpdateAsync()');
    expect(banner).toContain('Updates.fetchUpdateAsync()');
    expect(banner).toContain('Updates.reloadAsync()');
  });

  it('publishes the exact deployed SHA through version.json', () => {
    expect(workflow).toContain('EXPO_PUBLIC_BUILD_SHA: ${{ github.sha }}');
    expect(workflow).toContain('> _site/version.json');
    expect(workflow).toContain('LIVE SHA VERIFIED');
  });
});
