import fs from 'fs';
import path from 'path';

describe('Collection sale source of truth — no hidden duplicate workspace', () => {
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const profile = fs.readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8');

  it('has no legacy COLLECTIONS workspace or per-playlist creation button in Playlists', () => {
    expect(music).not.toContain("workspaceTab === 'COLLECTIONS'");
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
    expect(music).not.toContain('◆ CRÉER AVEC CET ALBUM');
    expect(music).not.toContain('title={isGroupView ? \'Créer une collection avec cet album\'');
  });

  it('keeps profile menu as a direct link to the one collection manager', () => {
    expect(profile).toContain("{ key: 'sellPlaylists', icon: '◆', label: 'Collections'");
    expect(profile).toContain("openFromMenu('PlaylistSale')");
    expect(profile).toContain('Un seul parcours');
    expect(profile).toContain('choisis obligatoirement € ou FREE');
  });
});
