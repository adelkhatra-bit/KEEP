import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Simple mobile journeys', () => {
  const music = read(__dirname, '..', 'MyMusicScreen.tsx');
  const profile = read(__dirname, '..', 'ProfileSettingsMobileScreen.tsx');

  it('keeps Mes musiques understandable with three primary ideas and a compact services link', () => {
    expect(music).toContain('Choisis simplement ce que tu veux faire.');
    expect(music).toContain('Mes morceaux · {localKeptEntries.length}');
    expect(music).toContain('Gérer');
    expect(music).toContain('Ranger');
    expect(music).toContain('Mes albums · {existingOffersForAdd.length}');
    expect(music).toContain('Spotify, Apple Music et autres connexions');
  });

  it('keeps profile location compact without removing manual city/country or GPS', () => {
    expect(profile).toContain('Ville & pays');
    expect(profile).toContain('⌖ Utiliser ma position');
    expect(profile).toContain('placeholder="Commence à saisir une ville"');
    expect(profile).toContain('✓ Vérifier la ville');
    expect(profile).toContain('accessibilityLabel={`Pays : ${COUNTRIES.find');
    expect(profile).toContain('ⓘ Confidentialité');
  });

  it('keeps persisted profile fields visible in the same screen', () => {
    for (const marker of ['Pseudo', 'Bio', 'Site web', 'Date de naissance', 'Genre']) {
      expect(profile).toContain(marker);
    }
  });
});
