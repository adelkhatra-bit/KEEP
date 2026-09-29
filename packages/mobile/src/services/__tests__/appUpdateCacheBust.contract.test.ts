import fs from 'fs';
import path from 'path';

describe('Web update cache-busting contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'appUpdateService.ts'), 'utf8');

  it('never uses a plain reload after detecting a newer web build', () => {
    expect(source).not.toContain('window.location.reload()');
    expect(source).toContain("params.set('__keep_update', String(Date.now()))");
    expect(source).toContain("window.location.replace(\`\${basePath}/?\${params.toString()}\`)");
  });

  it('keeps the current route while forcing the canonical root document', () => {
    expect(source).toContain("params.set('__keep_route', route)");
    expect(source).toContain("const basePath = '/KEEP'");
  });
});
