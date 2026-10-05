import { groupTracksByStyle } from '../styleGroups';

const t = (id: string, genres?: string[]) => ({ id, title: id, artist: 'a', genres } as any);

describe('tri par style (Trier ma musique)', () => {
  it('range chaque morceau dans son style, sans tenir compte de la casse ni des espaces', () => {
    const groups = groupTracksByStyle([t('1', ['Funk']), t('2', ['funk ']), t('3', ['R&B/Soul']), t('4', ['Hip-hop/Rap'])]);
    expect(groups.map((g) => [g.genre, g.tracks.length])).toEqual([['Funk', 2], ['Hip-hop/Rap', 1], ['R&B/Soul', 1]]);
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
