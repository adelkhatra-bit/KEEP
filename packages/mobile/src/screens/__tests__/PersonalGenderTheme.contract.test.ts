import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', relative), 'utf8');

describe('Loki personal theme for teen profile choice', () => {
  const settings = fs.readFileSync(path.resolve(__dirname, '..', 'ProfileSettingsMobileScreen.tsx'), 'utf8');
  const backdrop = read('components/PersonalThemeBackdrop.tsx');

  it('offers the validated teen/adult labels', () => {
    expect(settings).toContain("label: 'Garçon / homme'");
    expect(settings).toContain("label: 'Fille / femme'");
  });

  it('keeps default design unchanged and activates Rose nuit only for FEMALE', () => {
    expect(settings).toContain("gender==='FEMALE' ? 'Rose nuit' : 'Sombre Loki'");
    expect(backdrop).toContain("if (gender !== 'FEMALE') return null");
    expect(backdrop).toContain("backgroundColor: '#120812'");
  });

  it('never changes PASSER/GARDER semantic colors', () => {
    expect(backdrop).not.toContain('colors.keep');
    expect(backdrop).not.toContain('colors.pass');
  });

  for (const screen of ['HomeScreenCompact.tsx','DiscoverScreen.tsx','MyMusicScreen.tsx','PartiesScreen.tsx','ProfilePublicScreen.tsx']) {
    it(`mounts the personal background on ${screen}`, () => {
      const source = read(`screens/${screen}`);
      expect(source).toContain("PersonalThemeBackdrop");
      expect(source).toContain("<PersonalThemeBackdrop />");
    });
  }
});
