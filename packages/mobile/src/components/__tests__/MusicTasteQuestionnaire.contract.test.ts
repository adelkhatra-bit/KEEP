// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('MusicTasteQuestionnaire tap-only contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicTasteQuestionnaire.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('requires no free-text entry', () => {
    expect(source).not.toContain('TextInput');
    expect(source).not.toContain('value={query}');
    expect(source).toContain('Aucun texte à saisir · tout se choisit en un toucher');
    expect(source).toContain('PRÉREMPLI AUTOMATIQUEMENT');
  });

  it('prefills device language and country when no saved choice exists', () => {
    expect(source).toContain("savedCountries.length ? savedCountries : (detectedCountry ? [detectedCountry] : [])");
    expect(source).toContain("savedLanguages.length ? savedLanguages : (detectedLanguage ? [detectedLanguage] : [])");
  });

  it('keeps Create Pulse and Cancel aligned on one row', () => {
    expect(source).toContain('<View style={s.footerActions}>');
    expect(source).toContain('CRÉER MON PULSE');
    expect(source).toContain('ANNULER');
    expect(source).toContain("footerActions:{flexDirection:'row'");
    expect(source).toContain('footerAction:{flex:1,minWidth:0}');
  });
});
