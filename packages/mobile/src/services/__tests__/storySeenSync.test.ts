jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { mergeSeenStories } from '../musicStoriesService';

// Stories vues synchronisées ordinateur/mobile (06/10/2026) : la date la plus récente gagne, aucune perte.
describe('mergeSeenStories', () => {
  it('garde le visionnage le plus récent entre appareil et base', () => {
    const local = { a: '2026-10-06T10:00:00+00:00', b: '2026-10-06T12:00:00+00:00' };
    const server = { a: '2026-10-06T11:00:00+00:00', c: '2026-10-06T09:00:00+00:00' };
    expect(mergeSeenStories(local, server)).toEqual({ a: '2026-10-06T11:00:00+00:00', b: '2026-10-06T12:00:00+00:00', c: '2026-10-06T09:00:00+00:00' });
  });
  it('ignore les valeurs invalides', () => {
    expect(mergeSeenStories({ a: 5 as any }, {})).toEqual({});
  });
});
