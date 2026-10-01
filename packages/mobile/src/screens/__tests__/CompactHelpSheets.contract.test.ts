// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readScreen = (name: string) => fs.readFileSync(
  path.resolve(__dirname, '..', name),
  'utf8',
).replace(/\r\n/g, '\n');

describe('compact contextual help', () => {
  const parties = readScreen('PartiesScreen.tsx');
  const playlists = readScreen('MyMusicScreen.tsx');

  it('keeps Soirées uncluttered and moves guidance behind ?', () => {
    expect(parties).not.toContain('Événements · Soirées · Invitations');
    expect(parties).not.toContain('Publie, retrouve tes événements et réponds à tes invitations.');
    expect(parties).toContain('eventHelpButton');
    expect(parties).toContain('Tout faire dans Soirées');
    expect(parties).toContain('ContextHelpSheet');
  });

  it('keeps Playlists header uncluttered and moves guidance behind ?', () => {
    expect(playlists).not.toContain('Écouter · Trier · Organiser');
    expect(playlists).not.toContain('Choisis une action. Tu peux revenir ici quand tu veux.');
    expect(playlists).toContain('headerHelpButton');
    expect(playlists).toContain('Tout faire dans Playlists');
    expect(playlists).toContain('ContextHelpSheet');
  });
});
