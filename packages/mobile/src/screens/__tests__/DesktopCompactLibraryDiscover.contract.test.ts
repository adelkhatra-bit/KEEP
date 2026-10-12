import fs from 'fs';
import path from 'path';

const source = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');

describe('Loki Music — compact desktop / mobile without feature loss', () => {
  const music = source('MyMusicScreen.tsx');
  const discover = source('DiscoverScreen.tsx');

  it('opens the real music library and keeps every source filter', () => {
    expect(music).toContain('Toute ma musique · {localKeptEntries.length}');
    expect(music).toContain("originFilter !== 'ALL'");
    for (const filter of ['ALL', 'PRIVATE', 'LISTEN', 'SESSION', 'USERS', 'IDENTIFIED', 'PULSE']) {
      expect(music).toContain("['" + filter + "',");
    }
    expect(music).toContain('regularPlaylists.map((playlist)');
    expect(music).toContain('socialRepriseEntries.length');
  });

  it('makes visibility and connections one-step actions, keeping help available', () => {
    expect(music).toContain("setMobileSection('EDIT'); setActiveTab('MUSIQUES'); setManageMusicMode(true)");
    expect(music).toContain("onPress={() => navigation.navigate('MusicConnections')}");
    expect(music).toContain('setVisibilityIntroOpen(true)');
    expect(music).toContain('setWholeLibraryVisibility');
  });

  it('only applies wide compact styling in desktop layout', () => {
    expect(music).toContain('isDesktopLibrary && styles.focusActionStackDesktop');
    expect(discover).toContain('isDesktopDiscover && styles.usernameSearchDesktop');
    expect(discover).toContain('isDesktopDiscover && styles.searchPanelDesktop');
    expect(discover).toContain('maxWidth:640');
    expect(discover).toContain('maxWidth:860');
    expect(discover).toContain('onPress={() => void searchAroundMe()}');
  });
});
