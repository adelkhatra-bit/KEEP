const fs = require('fs');
const path = require('path');

describe('web update control contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'AppUpdateBanner.tsx'), 'utf8');

  it('never renders the update control on mobile-width web screens', () => {
    expect(source).toContain("width < 768");
    expect(source).toContain("if (Platform.OS !== 'web' || width < 768) return null;");
  });

  it('keeps a large manual update action always visible on desktop web', () => {
    expect(source).toContain("testID=\"keep-update-available-button\"");
    expect(source).toContain("MISE À JOUR");
    expect(source).toContain("minHeight: 52");
    expect(source).toContain("minWidth: 220");
    expect(source).not.toContain('↻');
  });
});
