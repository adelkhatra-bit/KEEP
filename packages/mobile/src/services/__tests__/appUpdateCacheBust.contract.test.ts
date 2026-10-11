import fs from 'fs';
import path from 'path';

describe('Web update cache-busting contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'appUpdateService.ts'), 'utf8');
  const banner = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx'), 'utf8');

  it('never uses a plain reload after detecting a newer web build', () => {
    expect(source).not.toContain('window.location.reload()');
    expect(source).toContain("params.set('__keep_update', String(Date.now()))");
    expect(source).toContain("window.location.replace(\`\${basePath}/?\${params.toString()}\`)");
  });

  it('keeps the current route while forcing the canonical root document', () => {
    expect(source).toContain("params.set('__keep_route', route)");
    expect(source).toContain("const basePath = '/KEEP'");
  });

  it('keeps web updates automatic and invisible after auth bootstrap', () => {
    expect(banner).toContain('return null;');
    expect(banner).not.toContain('keep-manual-update-control');
    expect(banner).not.toContain('NOUVELLE VERSION DISPONIBLE');
    expect(banner).toContain("if (!authReady || Platform.OS !== 'web') return undefined;");
    expect(banner).toContain('reloadToLatest();');
  });

  it('auto-fetches and reloads compatible production OTAs on native launch', () => {
    expect(banner).toContain("await import('expo-updates')");
    expect(banner).toContain('Updates.checkForUpdateAsync()');
    expect(banner).toContain('Updates.fetchUpdateAsync()');
    expect(banner).toContain('Updates.reloadAsync()');
  });
});
