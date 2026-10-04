// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('MusicTasteQuestionnaire global-catalog contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicTasteQuestionnaire.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('uses text only to search the global catalog; preferences remain tap selections', () => {
    expect(source).toContain('TextInput');
    expect(source).toContain('value={searchQuery}');
    expect(source).toContain("placeholder={tab === 'STYLES' ? 'Chercher un style'");
    expect(source).toContain("'Chercher une langue'");
    expect(source).toContain("'Chercher un pays'");
    expect(source).toContain("searchQuery ? 'Résultats trouvés'");
    expect(source).toContain('DÉJÀ PRÉPARÉ POUR TOI');
    expect(source).toContain('onPress={() => toggle(');
  });

  it('prefills device language and country when no saved choice exists', () => {
    expect(source).toContain("savedGenres.length ? savedGenres : suggestedGenres.slice(0, 12)");
    expect(source).toContain("savedCountries.length ? savedCountries : (detectedCountry ? [detectedCountry] : [])");
    expect(source).toContain("savedLanguages.length ? savedLanguages : (detectedLanguage ? [detectedLanguage] : [])");
  });

  it('keeps Create Pulse and Cancel aligned on one row', () => {
    expect(source).toContain('<View style={s.footerActions}>');
    expect(source).toContain('ENREGISTRER MES GOÛTS');
    expect(source).toContain('PLUS TARD');
    expect(source).toContain("footerActions:{flexDirection:'row'");
    expect(source).toContain('footerAction:{flex:1,minWidth:0}');
  });

  it('always shows existing selections and lets web/mobile users edit them', () => {
    expect(source).toContain('TES CHOIX · TOUCHE × POUR RETIRER');
    expect(source).toContain('removeSelected');
    expect(source).toContain('nestedScrollEnabled');
    expect(source).toContain('showsVerticalScrollIndicator');
    expect(source).toContain('selectedGenres.map');
    expect(source).toContain('selectedLanguages.map');
    expect(source).toContain('selectedCountries.map');
  });
});
