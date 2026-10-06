import { buildViewerDetail } from '../storyViewerDetail';
const tracks = [{ id: 'a', title: 'Alpha', artist: 'X' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }, { id: 'd', title: 'Delta' }];
describe('détail d’un spectateur de ma story (Adel 06/10/2026)', () => {
  it('temps par musique, ❤, et l’endroit exact où il est parti', () => {
    const d = buildViewerDetail(tracks, { chapters: [{ index: 0, seconds: 30 }, { index: 1, seconds: 12 }], tracksSeen: 2, tracksTotal: 4, watching: false }, new Set(['a']));
    expect(d.rows[0]).toMatchObject({ state: 'WATCHED', seconds: 30, liked: true });
    expect(d.rows[1].state).toBe('LEFT_HERE');
    expect(d.rows[2].state).toBe('NOT_SEEN');
    expect(d.leftAtTitle).toBe('Beta');
    expect(d.summary).toContain('parti pendant « Beta »');
    expect(d.summary).toContain('1 ❤');
  });
  it('arrivé au bout : pas de « parti pendant »', () => {
    const d = buildViewerDetail(tracks, { chapters: [{ index: 3, seconds: 5 }], tracksSeen: 4, tracksTotal: 4, watching: false }, new Set());
    expect(d.leftAtTitle).toBeNull();
    expect(d.summary).toContain('jusqu’au bout');
  });
  it('en cours de visionnage', () => {
    const d = buildViewerDetail(tracks, { chapters: [{ index: 1, seconds: 3 }], tracksSeen: 2, tracksTotal: 4, watching: true }, new Set());
    expect(d.leftAtTitle).toBeNull();
    expect(d.summary).toContain('regarde en ce moment');
  });
  it('clé de ❤ avec préfixe sale: gérée par keyOf', () => {
    const d = buildViewerDetail([{ id: 'sale:z', title: 'Z' }], { chapters: [{ index: 0, seconds: 9 }], tracksSeen: 1, tracksTotal: 1, watching: false }, new Set(['z']), (id) => id.replace(/^sale:/, ''));
    expect(d.rows[0].liked).toBe(true);
  });
});
