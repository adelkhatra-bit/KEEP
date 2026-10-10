jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));
import { pickStoryHolders } from '../musicStoriesService';

describe('anti-doublon entre stories (Adel 06/10/2026)', () => {
  it('garde le premier membre qui a mis la musique en story, jamais moi', () => {
    const h = pickStoryHolders([
      { trackId: 't1', profileId: 'b', username: 'bruno', at: '2026-10-06T12:00:00Z' },
      { trackId: 't1', profileId: 'a', username: 'adel', at: '2026-10-06T10:00:00Z' },
      { trackId: 't2', profileId: 'me', username: 'moi', at: '2026-10-06T09:00:00Z' },
    ], 'me');
    expect(h.t1).toEqual({ profileId: 'a', username: 'adel', since: '2026-10-06T10:00:00Z' });
    expect(h.t2).toBeUndefined();
  });
});
