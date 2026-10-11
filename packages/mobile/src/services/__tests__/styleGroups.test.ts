import { groupTracksByStyle } from '../styleGroups';

const t = (id: string, genres?: string[]) => ({ id, title: id, artist: 'a', genres } as any);

describe('tri par style (Trier ma musique)', () => {
  it('range chaque morceau dans son style, sans tenir compte de la casse ni des espaces', () => {
    const groups = groupTracksByStyle([t('1', ['Funk']), t('2', ['funk ']), t('3', ['R&B/Soul']), t('4', ['Hip-hop/Rap'])]);
    expect(groups.map((g) => [g.genre, g.tracks.length])).toEqual([['Funk', 2], ['Hip-hop/Rap', 1], ['R&B/Soul', 1]]);
  });
  it('évite les doublons Rap / Hip-Hop, Afrobeats / Afrobeat et Raï / Rai', () => {
    const groups = groupTracksByStyle([
      t('1', ['Rap']), t('2', ['Hip-hop/Rap']),
      t('3', ['Afrobeat']), t('4', ['Afrobeats']),
      t('5', ['Raï']), t('6', ['Rai']),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map(group => group.tracks.length)).toEqual([2, 2, 2]);
  });
  it('un morceau multi-genres apparaît dans chacun de ses styles, jamais deux fois dans le même', () => {
    const groups = groupTracksByStyle([t('1', ['Funk', 'funk', 'Soul'])]);
    expect(groups.map((g) => [g.genre, g.tracks.length]).sort()).toEqual([['Funk', 1], ['Soul', 1]]);
  });
  it('sans genre = groupe « Sans genre », trié du plus gros au plus petit', () => {
    const groups = groupTracksByStyle([t('1'), t('2', []), t('3', ['Jazz'])]);
    expect(groups[0]).toMatchObject({ genre: 'Sans genre' });
    expect(groups[0].tracks).toHaveLength(2);
    expect(groups[1].genre).toBe('Jazz');
  });
});

import { groupEntriesByArtist } from '../styleGroups';
describe('tri par artiste : uniquement ses morceaux (Adel 05/10/2026)', () => {
  const e = (id: string, artist: string, visibility = 'PUBLIC') => ({ visibility, track: { id, title: id, artist } as any });
  it('Jul ne contient que du Jul (le feat. reste chez l’artiste principal), accents/casse ignorés', () => {
    const groups = groupEntriesByArtist([e('1', 'Jul'), e('2', 'JUL'), e('3', 'Jul feat. Naps'), e('4', 'Naps'), e('5', 'SCH feat. Jul'), e('6', 'Ménélik')]);
    const jul = groups.find((g) => g.label.toLowerCase() === 'jul')!;
    expect(jul.entries.map((x) => x.track.id).sort()).toEqual(['1', '2', '3']);
    expect(groups.find((g) => g.label === 'SCH')!.entries.map((x) => x.track.id)).toEqual(['5']);
    expect(groups.find((g) => g.label === 'Naps')!.entries).toHaveLength(1);
    expect(groups.map((g) => g.label)).toEqual(['Jul', 'Ménélik', 'Naps', 'SCH']);
  });
  it('pas de doublon d’un même morceau et garde la visibilité de chaque entrée', () => {
    const groups = groupEntriesByArtist([e('1', 'Jul'), e('1', 'Jul'), e('2', 'Jul', 'PRIVATE')]);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries.some((x) => x.visibility === 'PRIVATE')).toBe(true);
  });
});
