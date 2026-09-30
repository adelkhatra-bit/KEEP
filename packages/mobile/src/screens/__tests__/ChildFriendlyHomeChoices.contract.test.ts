import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Child-friendly home choices', () => {
  const parties = read('PartiesScreen.tsx');
  const music = read('MyMusicScreen.tsx');

  it('keeps Soirées as a clean hub without mixing Battle into event actions', () => {
    for (const label of ['Voir les soirées', 'Rechercher un contact', 'Découvrir des événements', 'Répondre aux invitations', 'Créer une soirée']) {
      expect(parties).toContain(label);
    }
    expect(parties).toContain("navigation.navigate('Discover', { focus: 'PEOPLE'");
    expect(parties).toContain("navigation.navigate('Discover', { focus: 'EVENTS'");
    const home = parties.slice(parties.indexOf("{partyHome ? <View"), parties.indexOf("{partyHome ? <View") + 7000);
    expect(home).not.toContain('Jouer au Battle');
  });

  it('uses simple action verbs on Mes musiques', () => {
    for (const label of ['Écouter mes morceaux', 'Choisir ce qui est visible', 'Trier ma musique', 'Mes albums / collections', 'Connecter mes applis musique']) {
      expect(music).toContain(label);
    }
    expect(music).toContain('Écouter · Trier · Créer');
    expect(music).toContain("mobileSection === 'EDIT' ? 'Choisir ce qui est visible' : mobileSection === 'ORGANIZE' ? 'Trier ma musique'");
  });

  it('keeps every choice as a large one-tap row', () => {
    expect(parties).toContain('partyHomeChoice:{minHeight:74');
    expect(music).toContain('focusActionRow:{minHeight:70');
    expect(music).toContain('focusPrimary:{minHeight:80');
  });
});
