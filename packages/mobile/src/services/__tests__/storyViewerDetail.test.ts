import { buildViewerDetail, FULL_LISTEN_SECONDS } from '../storyViewerDetail';

const tracks = [{ id: 'a', title: 'Alpha', artist: 'X' }, { id: 'b', title: 'Beta' }, { id: 'c', title: 'Gamma' }, { id: 'd', title: 'Delta' }];
const base = { chapters: [], tracksSeen: 0, tracksTotal: 4, watching: false };

describe('détail d’un spectateur façon Instagram (Adel 06/10/2026)', () => {
  it('par identifiant réel : écoutée en entier / passée / arrêté ici, sans durée', () => {
    const d = buildViewerDetail(tracks, { ...base, trackViews: [{ trackId: 'a', seconds: 30 }, { trackId: 'b', seconds: 3 }, { trackId: 'c', seconds: 8 }], lastTrackId: 'c' }, new Set(['a']));
    expect(d.rows.map((r) => [r.title, r.outcome])).toEqual([['Alpha', 'FULL'], ['Beta', 'SKIPPED'], ['Gamma', 'LEFT_HERE']]);
    expect(d.rows[0].label).toBe('✓ Écoutée en entier');
    expect(d.rows[0].liked).toBe(true);
    expect(d.leftAtTitle).toBe('Gamma');
    expect(d.summary).toBe('3 musiques vues · 1 en entier · 1 ❤');
    expect(JSON.stringify(d)).not.toMatch(/\d+ s\b/);
  });
  it('les musiques non vues ne sont pas listées', () => {
    const d = buildViewerDetail(tracks, { ...base, trackViews: [{ trackId: 'd', seconds: FULL_LISTEN_SECONDS }], lastTrackId: 'd' }, new Set());
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ title: 'Delta', outcome: 'FULL' });
    expect(d.leftAtTitle).toBeNull();
  });
  it('la position qui glisse ne trompe plus : l’identifiant gagne sur l’index', () => {
    // Ancienne position 0 = « Delta » au moment de la vue ; la story a depuis reçu 3 nouvelles musiques devant.
    const d = buildViewerDetail(tracks, { ...base, chapters: [{ index: 0, seconds: 30 }], trackViews: [{ trackId: 'd', seconds: 30 }], lastTrackId: 'd' }, new Set());
    expect(d.rows.map((r) => r.title)).toEqual(['Delta']);
  });
  it('en cours de visionnage', () => {
    const d = buildViewerDetail(tracks, { ...base, watching: true, trackViews: [{ trackId: 'b', seconds: 4 }], lastTrackId: 'b' }, new Set());
    expect(d.rows[0].outcome).toBe('WATCHING');
  });
  it('repli anciennes vues sans identifiant : par position', () => {
    const d = buildViewerDetail(tracks, { ...base, chapters: [{ index: 0, seconds: 30 }, { index: 1, seconds: 2 }] }, new Set());
    expect(d.rows.map((r) => r.outcome)).toEqual(['FULL', 'SKIPPED']);
  });
  it('clé de ❤ avec préfixe sale: gérée par keyOf', () => {
    const d = buildViewerDetail([{ id: 'sale:z', title: 'Z' }], { ...base, trackViews: [{ trackId: 'z', seconds: 9 }], lastTrackId: 'z' }, new Set(['z']), (id) => id.replace(/^sale:/, ''));
    expect(d.rows[0].liked).toBe(true);
  });
});
