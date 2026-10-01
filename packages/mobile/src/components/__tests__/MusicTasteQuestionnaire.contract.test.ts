// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('MusicTasteQuestionnaire global-catalog contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'MusicTasteQuestionnaire.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('uses text only to search the global catalog; preferences remain tap selections', () => {
    expect(source).toContain('TextInput');
    expect(source).toContain('value={searchQuery}');
    expect(source).toContain('Rechercher un style dans tout le catalogue');
    expect(source).toContain('Rechercher une langue');
    expect(source).toContain('Rechercher un pays');
    expect(source).toContain('Résultats du catalogue mondial');
    expect(source).toContain('PRÉREMPLI AUTOMATIQUEMENT');
    expect(source).toContain('onPress={() => toggle(');
  });

  it('prefills device language and country when no saved choice exists', () => {
    expect(source).toContain("savedGenres.length ? savedGenres : suggestedGenres.slice(0, 12)");
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

  it('always shows existing selections and lets web/mobile users edit them', () => {
    expect(source).toContain('DÉJÀ SÉLECTIONNÉ · TOUCHE × POUR RETIRER');
    expect(source).toContain('removeSelected');
    expect(source).toContain('nestedScrollEnabled');
    expect(source).toContain('showsVerticalScrollIndicator');
    expect(source).toContain('selectedGenres.map');
    expect(source).toContain('selectedLanguages.map');
    expect(source).toContain('selectedCountries.map');
  });
});
