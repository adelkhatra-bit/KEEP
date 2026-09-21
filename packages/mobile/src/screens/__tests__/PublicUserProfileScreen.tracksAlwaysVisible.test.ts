// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen "Morceaux publics" always visible (Adel, 21/09/2026 : "c\'est une aberration pour une plateforme musicale")', () => {
  const source = readNormalized(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('removes the collapse-by-default accordion entirely -- no musicListExpanded state left', () => {
    expect(source).not.toContain('musicListExpanded');
    expect(source).not.toContain('setMusicListExpanded');
  });

  it('renders the track list unconditionally on the Musiques tab, no chevron gate', () => {
    const tabBlock = source.indexOf("activeTab === 'TRACKS' ? (");
    expect(tabBlock).toBeGreaterThan(-1);
    const musicSection = source.slice(tabBlock, tabBlock + 1200);
    expect(musicSection).toContain('{tracks.length > 0 ? (');
    expect(musicSection).not.toMatch(/⌃|⌄/);
  });

  it('keeps the empty-state message for zero public tracks (zéro suppression)', () => {
    expect(source).toContain('Aucun morceau public sur ce profil.');
  });
});
