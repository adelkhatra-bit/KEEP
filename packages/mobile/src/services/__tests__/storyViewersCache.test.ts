import { restoreStoryViewers, serializeStoryViewers, STORY_DURATION_MS } from '../storyViewersCache';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const v = (id: string, h: number, watching = false) => ({ viewerId: id, viewedAt: hoursAgo(h), watching });

describe('spectateurs de ma story : restent enregistrés pendant la durée de la story (24 h)', () => {
  it('rend les spectateurs de moins de 24 h, jamais « en train de regarder »', () => {
    const raw = serializeStoryViewers('me', [v('a', 1, true), v('b', 23.5)], NOW);
    const out = restoreStoryViewers<any>(raw, 'me', NOW + 60_000);
    expect(out.map((x) => x.viewerId)).toEqual(['a', 'b']);
    expect(out.every((x) => x.watching === false)).toBe(true);
  });
  it('retire ceux dont la vue dépasse la durée de la story', () => {
    const raw = serializeStoryViewers('me', [v('a', 1), v('old', 24.1)], NOW);
    expect(restoreStoryViewers<any>(raw, 'me', NOW).map((x) => x.viewerId)).toEqual(['a']);
    expect(STORY_DURATION_MS).toBe(86_400_000);
  });
  it('ne mélange jamais deux comptes sur le même appareil', () => {
    const raw = serializeStoryViewers('me', [v('a', 1)], NOW);
    expect(restoreStoryViewers<any>(raw, 'someone-else', NOW)).toEqual([]);
  });
  it('tolère une copie absente ou corrompue', () => {
    expect(restoreStoryViewers<any>(null, 'me', NOW)).toEqual([]);
    expect(restoreStoryViewers<any>('{pas du json', 'me', NOW)).toEqual([]);
    expect(restoreStoryViewers<any>(JSON.stringify({ ownerId: 'me', viewers: 'x' }), 'me', NOW)).toEqual([]);
  });
});
