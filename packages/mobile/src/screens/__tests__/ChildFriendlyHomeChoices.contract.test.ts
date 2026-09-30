import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Child-friendly home choices', () => {
  const parties = read('PartiesScreen.tsx');
  const music = read('MyMusicScreen.tsx');

  it('keeps Soirées as a clean four-choice hub in the requested order', () => {
    const homeStart = parties.indexOf("{partyHome ? <View");
    const home = parties.slice(homeStart, homeStart + 7000);
    const publish = home.indexOf('Publier un événement');
    const mine = home.indexOf('Mes soirées');
    const invites = home.indexOf('Mes invitations');
    const ranking = home.indexOf('Classement Battle');
    expect(publish).toBeGreaterThan(-1);
    expect(mine).toBeGreaterThan(publish);
    expect(invites).toBeGreaterThan(mine);
    expect(ranking).toBeGreaterThan(invites);
    expect(home).not.toContain('Jouer au Battle');
    expect(parties).toContain('À quoi sert Événements ?');
  });

  it('uses simple action verbs on Mes musiques', () => {
    for (const label of ['Écouter mes morceaux', 'Choisir ce qui est visible', 'Trier ma musique', 'Connecter mes applis musique']) {
      expect(music).toContain(label);
    }
    expect(music).toContain('Écouter · Trier · Organiser');
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
    expect(music).toContain("mobileSection === 'EDIT' ? 'Choisir ce qui est visible' : mobileSection === 'ORGANIZE' ? 'Trier ma musique'");
  });

  it('keeps every choice as a large one-tap row', () => {
    expect(parties).toContain('partyHomeChoice:{minHeight:74');
    expect(music).toContain('focusActionRow:{minHeight:70');
    expect(music).toContain('focusPrimary:{minHeight:80');
  });
});
