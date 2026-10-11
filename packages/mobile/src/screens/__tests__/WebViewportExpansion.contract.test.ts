import fs from 'fs';
import path from 'path';

describe('Web viewport expansion contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'index.js'), 'utf8');
  const exportFix = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'scripts', 'fix-web-export.cjs'), 'utf8');

  it('keeps the React root at full viewport height on desktop instead of auto height', () => {
    expect(source).toContain('@media (min-width: 900px)');
    expect(source).toContain('height:100dvh');
    expect(source).toContain('max-height:100dvh');
    expect(source).not.toContain("#root { position:relative; inset:auto; height:auto");
    expect(exportFix).toContain('height:100dvh!important');
    expect(exportFix).not.toContain('height:auto!important');
  });

  it('reacts immediately when DevTools or a desktop resize changes the viewport', () => {
    expect(source).toContain("window.addEventListener('resize', syncViewport");
    expect(source).toContain("window.visualViewport?.addEventListener('resize', syncViewport");
    expect(source).toContain("document.addEventListener('fullscreenchange', syncViewport");
    expect(source).toContain("root.style.height = \`\${h}px\`");
    expect(source).toContain("window.requestAnimationFrame(() =>");
  });
});
