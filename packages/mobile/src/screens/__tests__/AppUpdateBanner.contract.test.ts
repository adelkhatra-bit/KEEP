// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('web update control contract', () => {
  const banner = read(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx');
  const service = read(__dirname, '..', '..', 'services', 'appUpdateService.ts');
  const workflow = read(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'web-preview-pages.yml');

  it('keeps the update control always available on desktop and off mobile', () => {
    expect(banner).toContain("Platform.OS !== 'web' || width < 768");
    expect(banner).not.toContain("width < 768 || !latestSha");
    expect(banner).toContain('keep-manual-update-control');
    expect(banner).toContain("latestSha ? 'NOUVELLE VERSION DISPONIBLE' : 'ACTUALISER LOKI MUSIC'");
    expect(banner).toContain('checkNow().finally(reloadToLatest)');
    expect(banner).toContain('width: 340');
    expect(banner).toContain('minHeight: 68');
    expect(banner).toContain('setInterval');
  });

  it('forces a cache-busting reload to the public KEEP root', () => {
    expect(service).toContain("params.set('__keep_update'");
    expect(service).toContain('window.location.replace');
  });

  it('auto-applies a compatible production OTA on native TestFlight launch', () => {
    expect(banner).toContain("import * as Updates from 'expo-updates'");
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
