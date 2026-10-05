import { startStoryWatch, STORY_WATCH_MIN_MS, STORY_WATCH_PING_MS } from '../storyWatchService';
import { formatWatchDetail, formatWatchDuration } from '../storyActivity';

const UUID = '11111111-2222-3333-4444-555555555555';

describe('suivi de vue de story façon Instagram', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const make = () => {
    let t = 0;
    const calls: Array<[string, any]> = [];
    const rpc = jest.fn(async (fn: string, args: any) => { calls.push([fn, args]); return { data: fn === 'keep_story_watch_start' ? 'sess-1' : null, error: null }; });
    const tracker = startStoryWatch('owner', 5, rpc as any, () => t);
    return { tracker, calls, rpc, advance: async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); } };
  };

  it('ne compte aucune vue si le visiteur part avant le délai', async () => {
    const { tracker, rpc, advance } = make();
    await advance(STORY_WATCH_MIN_MS - 500);
    tracker.stop();
    await advance(STORY_WATCH_MIN_MS);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('compte la vue après le délai, suit musiques/écoute et envoie le départ', async () => {
    const { tracker, calls, advance } = make();
    await advance(STORY_WATCH_MIN_MS + 10);
    expect(calls[0][0]).toBe('keep_story_watch_start');
    expect(calls[0][1]).toEqual({ p_owner_id: 'owner', p_tracks_total: 5 });
    tracker.event({ type: 'shown', trackId: UUID, index: 1, total: 5 });
    tracker.event({ type: 'listen', trackId: UUID });
    await advance(STORY_WATCH_PING_MS);
    tracker.stop();
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('keep_story_watch_ping');
    expect(last[1]).toMatchObject({ p_session_id: 'sess-1', p_tracks_seen: 2, p_last_track_id: UUID, p_listened: true, p_ended: true });
    expect(last[1].p_seconds).toBeGreaterThanOrEqual(12);
  });

  it('ne transmet jamais un identifiant de musique en vente (non UUID)', async () => {
    const { tracker, calls, advance } = make();
    await advance(STORY_WATCH_MIN_MS + 10);
    tracker.event({ type: 'shown', trackId: 'sale:abc', index: 0, total: 5 });
    tracker.stop();
    expect(calls[calls.length - 1][1].p_last_track_id).toBeNull();
  });

  it('départ pendant la création de la session : la session est tout de même clôturée', async () => {
    let t = 0;
    let release: (v: any) => void = () => {};
    const calls: string[] = [];
    const rpc = jest.fn((fn: string) => { calls.push(fn); return fn === 'keep_story_watch_start' ? new Promise((r) => { release = r; }) : Promise.resolve({ data: null, error: null }); });
    const tracker = startStoryWatch('owner', 1, rpc as any, () => t);
    t = STORY_WATCH_MIN_MS + 5;
    await jest.advanceTimersByTimeAsync(STORY_WATCH_MIN_MS + 5);
    tracker.stop();
    release({ data: 'sess-9', error: null });
    await jest.advanceTimersByTimeAsync(5);
    expect(calls).toEqual(['keep_story_watch_start', 'keep_story_watch_ping']);
  });
});

describe('détail de vue pour le propriétaire', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('durée lisible', () => {
    expect(formatWatchDuration(12)).toBe('12 s');
    expect(formatWatchDuration(75)).toBe('1 min 15 s');
  });
  it('regarde maintenant', () => {
    const d = formatWatchDetail({ seconds: 8, tracksSeen: 1, tracksTotal: 3, listened: true, watching: true, leftAt: null }, now);
    expect(d.status).toBe('regarde maintenant');
    expect(d.detail).toBe('8 s · 1/3 musiques · écouté');
  });
  it('parti avant la fin sans écouter', () => {
    const d = formatWatchDetail({ seconds: 4, tracksSeen: 1, tracksTotal: 4, listened: false, watching: false, leftAt: '2026-10-05T11:57:00Z' }, now);
    expect(d.status).toBe('parti il y a 3 min');
    expect(d.detail).toBe('4 s · 1/4 musiques · pas écouté');
  });
});

import { formatLastShared } from '../storyActivity';
describe('fiche membre sans story', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('dit depuis quand rien n’a été partagé', () => {
    expect(formatLastShared(null, now)).toBe('Rien partagé pour l’instant');
    expect(formatLastShared('2026-10-05T07:00:00Z', now)).toBe('Dernier partage : il y a 5 h');
    expect(formatLastShared('2026-10-01T12:00:00Z', now)).toBe('Dernier partage : il y a 4 j');
    expect(formatLastShared('2026-09-14T12:00:00Z', now)).toBe('Dernier partage : il y a 3 sem.');
  });
  it('la fiche est centrée et affichée pour les bulles sans story', () => {
    const fs = require('fs'); const path = require('path');
    const quick = fs.readFileSync(path.join(__dirname, '../../components/SourceProfileQuickView.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    expect(quick).toContain("justifyContent:'center'");
    expect(quick).toContain('Pas de story du jour');
    expect(bar).toContain('noStory');
  });
});

describe('profil : Playlists et Artistes = mêmes cartes premium que Styles (Adel 05/10/2026)', () => {
  it('utilisent ProfileStyleCard dans la même grille', () => {
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../screens/ProfilePublicScreen.tsx'), 'utf8');
    expect(src).toContain('accessibilityLabel={`Écouter la playlist ${playlist.name}');
    expect(src).toContain('accessibilityLabel={`Écouter ${item.label}, ${selected.length} morceaux en Swipe`}');
    expect((src.match(/<ProfileStyleCard/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('bouton « mettre en story » et ordre de la rangée (Adel 05/10/2026)', () => {
  const fs = require('fs'); const path = require('path');
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');
  it('après un ajout : bouton gris tout de suite + popup « C’est bon »', () => {
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    expect((deck.match(/confirmStoryAdded\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(deck).toContain('C’est bon ✓');
    expect(deck).toContain('checking || justAddedNow || alreadyInStory ? s.addStoryButtonDone : s.addStoryButtonLit');
  });
  it('les stories vues restent avant les membres sans story', () => {
    const rail = read('../../components/MusicStoryRail.tsx');
    expect(rail).toContain('...unseenOthers, ...seenStories, ...friendsNoStory');
  });
});
