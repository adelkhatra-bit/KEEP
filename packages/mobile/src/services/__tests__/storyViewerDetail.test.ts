import fs from 'fs';
import path from 'path';
import { buildViewerDetail, FULL_LISTEN_SECONDS, normalizeStoryViewerPlayback } from '../storyViewerDetail';

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

describe('production v4 playback contract — PC/iOS', () => {
  it('reconstructs real track IDs and the stop position from chapters when v4 omits track_views', () => {
    const playback = normalizeStoryViewerPlayback({
      chapters: [{ i: 2, s: 8, t: 'c' }, { i: 0, s: 30, t: 'a' }, { i: 1, s: 3, t: 'b' }],
      playback_progress: {},
    });
    expect(playback.lastTrackId).toBe('c');
    expect(playback.trackViews).toEqual([
      { trackId: 'c', seconds: 8 }, { trackId: 'a', seconds: 30 }, { trackId: 'b', seconds: 3 },
    ]);
    const detail = buildViewerDetail(tracks, { ...base, ...playback }, new Set(['a']));
    expect(detail.rows.map((r) => [r.title, r.outcome, r.liked])).toEqual([
      ['Alpha', 'FULL', true], ['Beta', 'SKIPPED', false], ['Gamma', 'LEFT_HERE', false],
    ]);
  });
  it('does not erase old v4 track_views or fabricate missing progress', () => {
    expect(normalizeStoryViewerPlayback({ chapters: [{ i: 0, s: 4 }], track_views: [{ t: 'b', s: 12 }], last_track_id: 'b' }))
      .toMatchObject({ trackViews: [{ trackId: 'b', seconds: 12 }], lastTrackId: 'b' });
    expect(normalizeStoryViewerPlayback({ chapters: [] })).toEqual({ chapters: [], trackViews: [], lastTrackId: null });
  });
  it('keeps the highest observed seconds on repeated chapter entries', () => {
    expect(normalizeStoryViewerPlayback({ chapters: [{ i: 0, s: 3, t: 'a' }, { i: 0, s: 11, t: 'a' }] }).trackViews)
      .toEqual([{ trackId: 'a', seconds: 11 }]);
  });
});

describe('owner story viewer cross-device integration contract', () => {
  const component = fs.readFileSync(path.resolve(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../musicStoriesService.ts'), 'utf8');
  it('uses production v4 chapter playback and the same owner modal on PC and iPhone', () => {
    expect(service).toContain("client.rpc('keep_my_story_viewers_v4')");
    expect(service).toContain('...normalizeStoryViewerPlayback(row)');
    expect(component).toContain('loadMyLikesAmong(');
    expect(component).toContain('story-viewer-detail-');
    expect(component).toContain('setInterval(refreshHearts, 8000)');
  });
  it('does not misreport a failed viewer sync as zero views', () => {
    expect(component).toContain('setViewersError(true)');
    expect(component).not.toContain('catch(() => setViewers([]))');
    expect(component).toContain('story-viewers-retry');
    expect(component).toContain('setInterval(refreshViewers, 8000)');
  });
});
