// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('web update control contract', () => {
  const banner = read(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx');
  const service = read(__dirname, '..', '..', 'services', 'appUpdateService.ts');
  const workflow = read(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'web-preview-pages.yml');

  it('keeps a manual update button visible on every web width', () => {
    expect(banner).toContain('keep-manual-update-control');
    expect(banner).toContain('↻ Mise à jour');
    expect(banner).not.toContain('if (width < 768) return null');
    expect(banner).toContain('manualWrapCompact');
  });

  it('forces a cache-busting reload to the public KEEP root', () => {
    expect(service).toContain("params.set('__keep_update'");
    expect(service).toContain('window.location.replace');
  });

  it('publishes the exact deployed SHA through version.json', () => {
    expect(workflow).toContain('EXPO_PUBLIC_BUILD_SHA: ${{ github.sha }}');
    expect(workflow).toContain('> _site/version.json');
    expect(workflow).toContain('LIVE SHA VERIFIED');
  });
});
