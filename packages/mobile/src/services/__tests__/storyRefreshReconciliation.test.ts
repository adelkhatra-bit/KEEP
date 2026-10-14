import { reconcileStoryRefresh } from '../storyRefreshReconciliation';

type TestStory = {
  profileId: string; latestAt: string; tracks: Array<{ id: string }>;
  addedAt?: Record<string,string>;
};
const now = Date.parse('2026-10-13T16:00:00.000Z');
const story = (id: string, hoursAgo: number): TestStory => ({
  profileId: id, latestAt: new Date(now - hoursAgo * 3600000).toISOString(),
  tracks: [{id: 'song-'+id}],
});

describe('Story refresh does not blink disappearing 24h bubbles', () => {
  test('keeps a new story through one incomplete successful snapshot', () => {
    const misses = new Map<string,number>();
    const first = reconcileStoryRefresh([story('A', 1)], [], misses, now);
    expect(first).toHaveLength(1);
    expect(misses.get('A')).toBe(1);
    const back = reconcileStoryRefresh(first, [story('A', 1)], misses, now);
    expect(back).toHaveLength(1);
    expect(misses.has('A')).toBe(false);
  });

  test('removes story after two genuinely complete missing snapshots', () => {
    const misses = new Map<string,number>();
    const a = reconcileStoryRefresh([story('A',1)], [], misses, now);
    expect(reconcileStoryRefresh(a, [], misses, now)).toEqual([]);
    expect(misses.has('A')).toBe(false);
  });

  test('never retains an expired track beyond 24 hours even on an outage', () => {
    const misses = new Map<string,number>();
    expect(reconcileStoryRefresh([story('A', 25)], [], misses, now)).toEqual([]);
    expect(reconcileStoryRefresh([], [story('A',25)], misses, now)).toEqual([]);
  });

  test('does not keep empty fake stories or lost follow suggestions', () => {
    const misses = new Map<string,number>();
    const nonStory = {...story('A',1),tracks:[]};
    expect(reconcileStoryRefresh([nonStory], [], misses, now)).toEqual([]);
  });

  test('preserves current validated story data over older cache data', () => {
    const misses = new Map<string,number>();
    const current = {...story('A',1),tracks:[{id:'new-song'}]};
    expect(reconcileStoryRefresh([story('A',2)], [current], misses, now)).toEqual([current]);
  });

  test('removes stale tracks but retains fresh addedAt tracks', () => {
    const misses = new Map<string,number>();
    const original = {...story('A',1),tracks:[{id:'expired'},{id:'fresh'}],
      addedAt: {'expired':new Date(now-26*3600000).toISOString(),
        'fresh':new Date(now-3600000).toISOString()}};
    expect(reconcileStoryRefresh([original], [], misses, now)[0]?.tracks).toEqual([{id:'fresh'}]);
  });
});
