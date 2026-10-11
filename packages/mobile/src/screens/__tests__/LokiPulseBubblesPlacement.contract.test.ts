// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const owner = read(__dirname, '..', 'ProfilePublicScreen.tsx');
const home = read(__dirname, '..', 'HomeScreenCompact.tsx');

describe('Loki Pulse placement', () => {
  it('places DNA before social links and separate Pulse after social links', () => {
    const dna = owner.indexOf('testID="profile-music-dna-card"');
    const social = owner.indexOf('<View style={s.socialHub}>');
    const pulse = owner.indexOf('testID="profile-loki-pulse-track-bubbles"');
    expect(dna).toBeGreaterThan(-1);
    expect(social).toBeGreaterThan(dna);
    expect(pulse).toBeGreaterThan(social);
  });

  it('home has no genre-style identity card', () => {
    expect(home).not.toContain('testID="home-loki-pulse-track-bubbles"'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('<MusicStyleBubbles');
    expect(home).not.toContain('homeDnaCard');
  });
});
