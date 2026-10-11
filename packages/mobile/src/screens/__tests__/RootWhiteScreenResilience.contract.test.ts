import fs from 'fs';
import path from 'path';

describe('root white-screen resilience', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'index.js'), 'utf8');

  it('wraps the full runtime in a render error boundary', () => {
    expect(source).toContain('class RootRenderBoundary extends React.Component');
    expect(source).toContain("reportRootDiagnostic('ROOT_RENDER_CRASH'");
    expect(source).toContain('React.createElement(\n    RootRenderBoundary');
  });

  it('never leaves the refresh shield above the recovery screen', () => {
    expect(source).toContain("document.getElementById('keep-web-refresh-shield')?.remove()");
  });

  it('deduplicates crash telemetry per browser session for scale', () => {
    expect(source).toContain("ROOT_DIAGNOSTIC_SESSION_PREFIX");
    expect(source).toContain("sessionStorage.getItem(storageKey)");
    expect(source).toContain("client_diagnostics");
  });

  it('offers recovery without signing the user out', () => {
    expect(source).toContain('RÉESSAYER');
    expect(source).toContain('RECHARGER LA DERNIÈRE VERSION');
    expect(source).not.toContain('logout()');
  });
});
