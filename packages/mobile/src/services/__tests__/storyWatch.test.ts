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
    expect(last[0]).toBe('keep_story_watch_chapters_ping');
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
    expect(calls).toEqual(['keep_story_watch_start', 'keep_story_watch_chapters_ping']);
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
    expect(d.detail).toBe('8 s · 1 musique sur 3 · écouté');
  });
  it('parti avant la fin sans écouter', () => {
    const d = formatWatchDetail({ seconds: 4, tracksSeen: 1, tracksTotal: 4, listened: false, watching: false, leftAt: '2026-10-05T11:57:00Z' }, now);
    expect(d.status).toBe('parti il y a 3 min');
    expect(d.detail).toBe('4 s · 1 musique sur 4 · pas écouté');
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
    expect(src).toContain('accessibilityLabel={`Écouter ${item.label}, ${item.entries.length} morceaux en Swipe`}');
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

import { formatStoryCountdown } from '../storyActivity';
describe('chronomètre 24 h de la story', () => {
  const added = '2026-10-05T10:00:00Z';
  it('décompte le temps restant', () => {
    expect(formatStoryCountdown(added, Date.parse('2026-10-05T10:00:00Z'))).toBe('24:00:00');
    expect(formatStoryCountdown(added, Date.parse('2026-10-05T10:29:00Z'))).toBe('23:31:00');
    expect(formatStoryCountdown(added, Date.parse('2026-10-06T09:59:53Z'))).toBe('00:00:07');
  });
  it('s’arrête à zéro et ignore une date invalide', () => {
    expect(formatStoryCountdown(added, Date.parse('2026-10-07T10:00:00Z'))).toBe('00:00:00');
    expect(formatStoryCountdown('nope')).toBeNull();
    expect(formatStoryCountdown(null)).toBeNull();
  });
  it('le deck affiche le chronomètre', () => {
    const fs = require('fs'); const path = require('path');
    expect(fs.readFileSync(path.join(__dirname, '../../components/MusicSwipeDeckModal.tsx'), 'utf8')).toContain('useStoryCountdown(');
  });
});

import { rankBadgeFor } from '../storyActivity';
describe('classement de la semaine sur les bulles', () => {
  it('médailles top 3, étoile top 10, rien en dessous ni sous 3 points', () => {
    expect(rankBadgeFor(1, 57)?.icon).toBe('🥇');
    expect(rankBadgeFor(2, 4)?.icon).toBe('🥈');
    expect(rankBadgeFor(3, 3)?.icon).toBe('🥉');
    expect(rankBadgeFor(7, 5)?.icon).toBe('⭐');
    expect(rankBadgeFor(11, 9)).toBeNull();
    expect(rankBadgeFor(1, 2)).toBeNull();
    expect(rankBadgeFor(undefined, 10)).toBeNull();
  });
  it('la bulle affiche le badge en haut à gauche, sans toucher aux autres pastilles', () => {
    const fs = require('fs'); const path = require('path');
    const rail = fs.readFileSync(path.join(__dirname, '../../components/MusicStoryRail.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '../../components/ProfileStoryBar.tsx'), 'utf8');
    expect(rail).toContain('rankBadge: { position: \'absolute\', left: 0, top: 0');
    expect(rail).toContain('testID={`story-rank-${profileId}`}');
    expect(bar).toContain('loadStoryRanking()');
    expect(bar).toContain('ranking={ranking}');
  });
});

describe('barre des 5 onglets toujours visible (Adel 05/10/2026)', () => {
  it('Navigation affiche la barre persistante sous les écrans empilés, sans doublon sur les onglets', () => {
    const fs = require('fs'); const path = require('path');
    const nav = fs.readFileSync(path.join(__dirname, '../../navigation/Navigation.tsx'), 'utf8');
    expect(nav).toContain('function PersistentTabBar()');
    expect(nav).toContain("if (rootRoute === 'Main') return null;");
    expect(nav).toContain('<PersistentTabBar />');
    for (const label of ['Loki Music', 'Découvertes', 'Playlists', 'Soirées', 'Profil']) expect(nav).toContain(`label: '${label}'`);
    expect(nav).toContain('confirmLeaveGame(go)');
  });
});

import { formatSince } from '../storyActivity';
describe('fiche membre : dernière musique partagée + dernière connexion', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('durées courtes', () => {
    expect(formatSince('2026-10-05T11:59:40Z', now)).toBe('à l’instant');
    expect(formatSince('2026-10-05T11:20:00Z', now)).toBe('il y a 40 min');
    expect(formatSince('2026-10-05T07:00:00Z', now)).toBe('il y a 5 h');
    expect(formatSince('2026-10-01T12:00:00Z', now)).toBe('il y a 4 j');
    expect(formatSince(null, now)).toBeNull();
  });
  it('la fiche lit la dernière musique et la présence réelles', () => {
    const fs = require('fs'); const path = require('path');
    const quick = fs.readFileSync(path.join(__dirname, '../../components/SourceProfileQuickView.tsx'), 'utf8');
    const svc = fs.readFileSync(path.join(__dirname, '../musicStoriesService.ts'), 'utf8');
    expect(quick).toContain('loadLastShared(nextProfile.id)');
    expect(quick).toContain('loadProfilesActivity([nextProfile.id])');
    expect(quick).toContain('testID="quick-last-seen"');
    expect(svc).toContain("export async function loadLastShared");
  });
});

describe('chapitres : temps exact passé dans chaque musique (Adel 05/10/2026)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('mesure chaque chapitre de son arrivée jusqu’à la musique suivante', async () => {
    let t = 0;
    const calls: Array<[string, any]> = [];
    const rpc = jest.fn(async (fn: string, args: any) => { calls.push([fn, args]); return { data: fn === 'keep_story_watch_start' ? 'sess-c' : null, error: null }; });
    const tracker = startStoryWatch('owner', 16, rpc as any, () => t);
    const advance = async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); };
    tracker.event({ type: 'shown', trackId: 'a', index: 0, total: 16 });
    await advance(25000);
    tracker.event({ type: 'shown', trackId: 'b', index: 1, total: 16 });
    await advance(9000);
    tracker.stop();
    const last = calls[calls.length - 1][1];
    expect(last.p_ended).toBe(true);
    expect(last.p_tracks_seen).toBe(2);
    const byIndex = Object.fromEntries(last.p_chapters.map((c: any) => [c.i, c.s]));
    expect(byIndex[0]).toBe(25);
    expect(byIndex[1]).toBe(9);
  });
  it('affiche « Chapitres : 1 · 25 s  2 · 9 s » pour le propriétaire, 4 au plus', () => {
    const base = { seconds: 34, tracksSeen: 2, tracksTotal: 16, listened: true, watching: false, leftAt: null };
    expect(formatWatchDetail({ ...base, chapters: [{ index: 0, seconds: 25 }, { index: 1, seconds: 9 }] }).chaptersLine).toBe('Chapitres : 1 · 25 s  2 · 9 s');
    const many = Array.from({ length: 6 }, (_, i) => ({ index: i, seconds: 3 }));
    expect(formatWatchDetail({ ...base, chapters: many }).chaptersLine).toBe('Chapitres : 1 · 3 s  2 · 3 s  3 · 3 s  4 · 3 s … +2');
    expect(formatWatchDetail({ ...base }).chaptersLine).toBeNull();
  });
});
