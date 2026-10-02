import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Cross-tab People / Events / Collections integration', () => {
  const parties = read('PartiesScreen.tsx');
  const discover = read('DiscoverScreen.tsx');
  const music = read('MyMusicScreen.tsx');
  const salePanel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the three event views aligned and permanently visible', () => {
    const rail = parties.slice(parties.indexOf('accessibilityLabel="Navigation de la soirée"') - 120, parties.indexOf('accessibilityLabel="Navigation de la soirée"') + 2600);
    for (const label of ['La soirée', 'Activité', 'Playlist']) expect(rail).toContain(label);
    expect(rail).not.toContain("partySection !== 'DETAILS'");
    expect(rail).not.toContain("partySection !== 'PLAYLIST'");
  });

  it('reuses Discover for contact search and public event discovery', () => {
    // 07af7788 fix(parties): les raccourcis Découvrir dupliqués dans Soirées ont été retirés ; Découvrir reste l’unique entrée.
    expect(parties).not.toContain("navigation.navigate('Discover', { focus: 'PEOPLE'");
    expect(parties).not.toContain("navigation.navigate('Discover', { focus: 'EVENTS'");
    expect(discover).toContain("const [discoverMode, setDiscoverMode] = useState<'PEOPLE' | 'EVENTS'>('PEOPLE')");
    expect(discover).toContain("loadUpcomingEvents(user?.id)");
    expect(discover).toContain('PERSONNES');
    expect(discover).toContain('ÉVÉNEMENTS');
    expect(discover).toContain("openEventInline(event)");
    expect(discover).toContain('Rechercher un pseudo Loki Music');
  });

  it('opens a discovered event in the real Soirées screen, not a duplicate screen', () => {
    expect(parties).toContain("route?.params?.openEventId");
    expect(parties).toContain("setPartiesTab('SOIREES')");
    expect(parties).toContain("setPartySection('EVENT')");
    expect(parties).toContain("setEventTab('LOBBY')");
  });

  it('keeps one collection manager and uses Playlists only as its track selector', () => {
    for (const marker of ['TOUTES LES COLLECTIONS', '✎ MODIFIER', '€ / FREE', '＋ CRÉER UNE COLLECTION']) {
      expect(salePanel).toContain(marker);
    }
    // 1d1ecb70 / 0e5272a1 : la création reste dans Pépites (contrat collectionCreationMustRemainInPepites).
    expect(salePanel).not.toContain("screen: 'MyMusic', params: { createSaleCollection: true");
    expect(salePanel).toContain('collectionCartOpen');
    expect(music).toContain("route?.params?.createSaleCollection");
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
  });
});
