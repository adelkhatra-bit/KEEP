import fs from 'fs';
import path from 'path';

const mobileRoot = path.join(__dirname, '..', '..', '..');
const entry = fs.readFileSync(path.join(mobileRoot, 'index.js'), 'utf8');
const exportFix = fs.readFileSync(path.join(mobileRoot, 'scripts', 'fix-web-export.cjs'), 'utf8');

describe('web refresh surface contract', () => {
  it('uses one Loki background before and after the Expo bundle mounts', () => {
    expect(entry).toContain('background:#0B0A12');
    expect(entry).not.toContain('background:#090610');
    expect(exportFix).toContain('keep-shell-background');
    expect(exportFix).toContain('html,body,#root{margin:0;background:#0B0A12!important}');
  });

  it('masks the transient auth/onboarding layer during a web refresh', () => {
    expect(entry).toContain('function WebRefreshSurfaceGuard()');
    expect(entry).toContain('supabase.auth.getSession()');
    expect(entry).toContain('waitingForSessionUser');
    expect(entry).toContain('React.createElement(WebRefreshSurfaceGuard)');
  });

  it('locks the viewport only on mobile and releases desktop width/height', () => {
    expect(entry).toContain('@media (max-width: 899px)');
    expect(entry).toContain('@media (min-width: 900px)');
    expect(entry).toContain('position:relative; inset:auto; height:auto; min-height:100vh; max-height:none; overflow:visible;');
    expect(exportFix).toContain('keep-desktop-shell');
  });
});
