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

  it('keeps the child-simple primary choice and Later aligned on one row', () => {
    expect(source).toContain('<View style={s.footerActions}>');
    expect(source).toContain('Quels sons tu aimes ?');
    expect(source).toContain('Touche tes styles préférés. Loki s’occupe du reste.');
    expect(source).toContain('C’EST BON');
    expect(source).toContain('PLUS TARD');
    expect(source).toContain("footerActions:{flexDirection:'row'");
    expect(source).toContain('footerAction:{flex:1,minWidth:0}');
  });

  it('keeps advanced language/country editing one tap away on the same surface', () => {
    expect(source).toContain('PLUS DE CHOIX');
    expect(source).toContain('accessibilityState={{ expanded: advancedOpen }}');
    expect(source).toContain('TES CHOIX · TOUCHE × POUR RETIRER');
    expect(source).toContain('removeSelected');
    expect(source).toContain('nestedScrollEnabled');
    expect(source).toContain('showsVerticalScrollIndicator');
    expect(source).toContain('selectedGenres.map');
    expect(source).toContain('selectedLanguages.map');
    expect(source).toContain('selectedCountries.map');
  });
});
