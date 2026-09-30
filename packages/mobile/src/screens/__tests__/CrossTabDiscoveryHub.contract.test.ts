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
    expect(parties).toContain("navigation.navigate('Discover', { focus: 'PEOPLE'");
    expect(parties).toContain("navigation.navigate('Discover', { focus: 'EVENTS'");
    expect(discover).toContain("const [discoverMode, setDiscoverMode] = useState<'PEOPLE' | 'EVENTS'>('PEOPLE')");
    expect(discover).toContain('loadUpcomingEvents()');
    expect(discover).toContain('PERSONNES');
    expect(discover).toContain('ÉVÉNEMENTS');
    expect(discover).toContain("navigation.navigate('Parties', { openEventId: event.id");
    expect(discover).toContain('Rechercher un pseudo Loki Music');
  });

  it('opens a discovered event in the real Soirées screen, not a duplicate screen', () => {
    expect(parties).toContain("route?.params?.openEventId");
    expect(parties).toContain("setPartiesTab('SOIREES')");
    expect(parties).toContain("setPartySection('EVENT')");
    expect(parties).toContain("setEventTab('LOBBY')");
  });

  it('keeps one collection manager and uses Playlists only as its track selector', () => {
    for (const marker of ['MES COLLECTIONS PUBLIÉES', '♫ Morceaux', '€ / FREE', '＋ CRÉER UNE COLLECTION']) {
      expect(salePanel).toContain(marker);
    }
    expect(salePanel).toContain("params: { createSaleCollection: true }");
    expect(music).toContain("route?.params?.createSaleCollection");
    expect(music).not.toContain("setWorkspaceTab('COLLECTIONS')");
  });
});
