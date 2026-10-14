import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Simple mobile journeys', () => {
  const music = read(__dirname, '..', 'MyMusicScreen.tsx');
  const profile = read(__dirname, '..', 'ProfileSettingsMobileScreen.tsx');

  it('keeps Playlists understandable without permanent instructional clutter', () => {
    expect(music).toContain('Toute ma musique · {localKeptEntries.length}');
    expect(music).toContain('Visibilité');
    expect(music).toContain('Trier mes titres');
    expect(music).toContain('focusActionStack');
    expect(music).toContain('Mes services musicaux');
    expect(music).toContain('Connecter ou synchroniser');
    expect(music).toContain('accessibilityLabel="Tout comprendre sur Playlists"');
    expect(music).toContain('Tout faire dans Playlists');
    expect(music).not.toContain('Choisis une action. Tu peux revenir ici quand tu veux.');
    expect(music).not.toContain('Écouter · Trier · Organiser');
  });

  it('keeps profile location compact without removing manual city/country or GPS', () => {
    expect(profile).toContain('Localisation');
    expect(profile).toContain('Utiliser ma position');
    expect(profile).toContain('placeholder="Commence à saisir une ville"');
    expect(profile).toContain('✓ Vérifier cette ville');
    expect(profile).toContain('ⓘ Confidentialité');
    expect(profile).toContain('OU SAISIS MANUELLEMENT');
    expect(profile).toContain('countryButtonWide');
    expect(profile).not.toContain('locationActionRow:{');
  });

  it('keeps persisted profile fields visible in the same screen', () => {
    for (const marker of ['Pseudo', 'Bio', 'Site web', 'Date de naissance', 'Genre']) {
      expect(profile).toContain(marker);
    }
  });
});
