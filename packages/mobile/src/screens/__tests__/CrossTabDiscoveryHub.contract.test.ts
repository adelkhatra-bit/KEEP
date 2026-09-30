import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').replace(/\r\n/g, '\n');

describe('Cross-tab People / Events / Collections integration', () => {
  const parties = read('PartiesScreen.tsx');
  const discover = read('DiscoverScreen.tsx');
  const music = read('MyMusicScreen.tsx');

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

  it('surfaces the full album/collection manager from Playlists', () => {
    for (const marker of ['Mes albums / collections', 'MES ALBUMS / COLLECTIONS', 'MUSIQUES DISPONIBLES', '＋ / − MUSIQUES', 'PRIX · € / FREE · STATUT']) {
      expect(music).toContain(marker);
    }
  });
});
