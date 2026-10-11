import fs from 'fs';
import path from 'path';

// Adel 07/10/2026 : deux bugs du profil visité.
// 1) « la liste Artistes est en vrac, elle devrait être dans des dossiers, comme les autres profils » ;
// 2) « la petite flèche retour me fait retomber sur un profil qui n'est pas le mien (autre design), il faut rafraîchir ».
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const visited = read('PublicUserProfileScreen.tsx');
const owner = read('ProfilePublicScreen.tsx');
const grid = read('..', 'components', 'ProfileArtistFolderGrid.tsx');

describe('profil visité : onglet Artistes en dossiers, comme le propre profil (Adel 07/10/2026)', () => {
  it('un seul composant partagé (regroupement + carte premium des Styles)', () => {
    expect(grid).toContain('groupEntriesByArtist(entries)');
    expect(grid).toContain('<ProfileStyleCard');
    expect(owner).toContain("import ProfileArtistFolderGrid from '../components/ProfileArtistFolderGrid';");
    expect(visited).toContain("import ProfileArtistFolderGrid from '../components/ProfileArtistFolderGrid';");
    // Aucune seconde implémentation du regroupement dans les écrans.
    expect(owner).not.toContain('groupEntriesByArtist(');
    expect(visited).not.toContain('groupEntriesByArtist(');
  });

  it('le profil visité utilise SES morceaux et ouvre le Swipe de l’artiste touché (plus de liste plate)', () => {
    expect(visited).toContain('entries={artistFolderEntries}');
    expect(visited).toContain('swipeTracks.map((track, index) => ({ track, visibility:');
    expect(visited).toContain("onOpenArtist={(folder) => openBrowseSwipe({ type: 'artist', value: folder.key, label: folder.label })}");
    expect(visited).not.toContain('<View style={styles.musicList}>{artistGroups.map(');
  });
});

describe('profil visité : la flèche retour ne retombe jamais sur un autre profil (Adel 07/10/2026)', () => {
  const start = visited.indexOf('const leaveVisitedProfile = () => {');
  const body = visited.slice(start, visited.indexOf('\n  };', start));

  it('les deux flèches retour passent par le même gestionnaire', () => {
    expect(start).toBeGreaterThan(-1);
    expect((visited.match(/onPress=\{leaveVisitedProfile\}/g) || []).length).toBe(2);
    expect(visited).not.toContain("navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')");
  });

  it('revient d’où l’on vient, jamais vers un autre profil visité resté dessous', () => {
    expect(body).toContain("previousRoute.name !== 'PublicProfile'");
    expect(body).toContain('navigation.goBack();');
  });

  it('sans écran précédent : remplace la pile par SON profil (Main > Profil), jamais un empilement par-dessus', () => {
    expect(body).toContain("navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Profile' } }] });");
    expect(body).not.toContain("navigation.navigate('Main')");
  });

  it('web : retire ?u= / &share= (pseudo du profil visité) de l’adresse en quittant', () => {
    expect(visited).toContain("import { clearConsumedShareParams } from '../components/SharedMusicHandoff';");
    expect(body).toContain('clearConsumedShareParams();');
  });
});
