import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Child-friendly home choices', () => {
  const parties = read('PartiesScreen.tsx');
  const music = read('MyMusicScreen.tsx');

  // Adel (02/10/2026) : le Classement Battle quitte Soirées (écran Battle).
  it('keeps Soirées as a clean three-choice hub in the requested order', () => {
    const homeStart = parties.indexOf("{partyHome ? <View");
    const home = parties.slice(homeStart, homeStart + 7000);
    const create = home.indexOf('>Créer</Text>');
    const mine = home.indexOf('>Mes soirées</Text>');
    const invites = home.indexOf('>Invitations</Text>');
    expect(create).toBeGreaterThan(-1);
    expect(mine).toBeGreaterThan(create);
    expect(invites).toBeGreaterThan(mine);
    expect(home).not.toContain('>Classement Battle</Text>');
    expect(home).not.toContain('Jouer au Battle');
    expect(parties).toContain('Tout comprendre sur Soirées');
    expect(parties).toContain('Tout faire dans Soirées');
    expect(parties).not.toContain('Événements · Soirées · Invitations');
  });

  it('uses simple actions on Playlists and moves explanations behind the help button', () => {
    for (const label of ['Écouter mes morceaux', 'Choisir ce qui est visible', 'Trier ma musique', 'Connecter mes applis musique']) {
      expect(music).toContain(label);
    }
    expect(music).toContain('accessibilityLabel="Tout comprendre sur Playlists"');
    expect(music).toContain('Tout faire dans Playlists');
    expect(music).not.toContain('Écouter · Trier · Organiser');
    expect(music).not.toContain('Choisis une action. Tu peux revenir ici quand tu veux.');
  });

  it('keeps every primary choice as a large one-tap row', () => {
    expect(parties).toContain('partyHomeChoice:{minHeight:74');
    expect(music).toContain('focusActionRow:{minHeight:70');
    expect(music).toContain('focusPrimary:{minHeight:80');
  });
});
