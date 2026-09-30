import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Child-friendly home choices', () => {
  const parties = read('PartiesScreen.tsx');
  const music = read('MyMusicScreen.tsx');

  it('uses simple action verbs on the Soirées home', () => {
    for (const label of ['Créer une soirée', 'Voir les soirées', 'Répondre aux invitations', 'Voir la musique', 'Jouer au Battle']) {
      expect(parties).toContain(label);
    }
    expect(parties).toContain('Choisis une action.');
    expect(parties).toContain('Oui, peut-être ou non');
    expect(parties).toContain('Quiz musical');
  });

  it('uses simple action verbs on Mes musiques', () => {
    for (const label of ['Écouter mes morceaux', 'Choisir ce qui est visible', 'Trier ma musique', 'Créer une collection', 'Connecter mes applis musique']) {
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
