// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('deployment update visibility contract', () => {
  const banner = read(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx');
  const service = read(__dirname, '..', '..', 'services', 'appUpdateService.ts');
  const workflow = read(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'web-preview-pages.yml');

  it('keeps a manual desktop update control permanently available', () => {
    expect(banner).toContain("width >= 768");
    expect(banner).toContain('keep-manual-update-control');
    expect(banner).toContain('MISE À JOUR');
    expect(banner).toContain('Actualiser Loki Music');
    expect(banner).toContain('reloadToLatest()');
    expect(banner).toContain('setInterval');
  });

  it('shows a real update banner with a later choice when a newer SHA is published', () => {
    expect(banner).toContain('NOUVELLE VERSION DISPONIBLE');
    expect(banner).toContain('METTRE À JOUR');
    expect(banner).toContain('PLUS TARD');
    expect(banner).toContain('const dismiss = useAppUpdateStore');
  });

  it('keeps automatic cache-busted web refresh available', () => {
    expect(banner).toContain('latestSha');
    expect(banner).toContain('reloadToLatest()');
    expect(service).toContain("params.set('__keep_update'");
    expect(service).toContain('window.location.replace');
  });

  it('auto-applies a compatible production OTA on native TestFlight launch', () => {
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
