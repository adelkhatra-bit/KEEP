// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('compact contextual help contract', () => {
  it('keeps Soirées guidance behind the question mark', () => {
    const source = read('PartiesScreen.tsx');
    expect(source).not.toContain('Publie, retrouve tes événements et réponds à tes invitations.');
    expect(source).toContain('Tout comprendre sur Soirées');
  });

  it('keeps Playlists guidance behind the question mark', () => {
    const source = read('MyMusicScreen.tsx');
    expect(source).not.toContain('Écouter · Trier · Organiser');
    expect(source).toContain('Tout faire dans Playlists');
  });
});
