// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Battle mobile style selector', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');

  it('keeps the horizontal music-style selector compact on 390x844', () => {
    expect(source).toContain('style={s.themeScroll}');
    expect(source).toContain("themeScroll: { flexGrow: 0, flexShrink: 0, height: 38, maxHeight: 38 }");
    expect(source).toContain("theme: { height: 32, minHeight: 32");
    expect(source).toContain("themeRow: { gap: 6, paddingRight: 12, alignItems: 'center' }");
  });
});
