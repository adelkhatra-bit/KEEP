import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { STORY_WINDOW_HOURS } from '../musicStoriesService';

const viewer = { id: 'me', username: 'moi', avatarUrl: null };

describe('story personnelle (loadOwnStory)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  const body = src.slice(src.indexOf('export async function loadOwnStory'), src.indexOf('Musiques EN VENTE dans les stories'));
  it('contains ONLY what the user shared publicly or put on sale (not identified/masked tracks)', () => {
    expect(body).toContain(".eq('visibility', 'PUBLIC')");
    expect(body).toContain(".eq('profile_id', viewer.id)");
    expect(body).toContain('enrichStoriesWithSales(');
    expect(body).not.toContain('sessions');
    expect(src).not.toContain('buildOwnStory');
  });
  it('returns null without a client, so the profile never breaks offline', async () => {
    const { loadOwnStory } = require('../musicStoriesService');
    expect(await loadOwnStory(viewer)).toBeNull();
  });
  it('keeps the 72h window constant', () => { expect(STORY_WINDOW_HOURS).toBe(72); });
});

describe('intégration : ta story dans la barre du profil', () => {
  const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('« Ta story » comes first, seen stories are greyed with a check and sorted last, no scrolling', () => {
    const rail = src('components', 'MusicStoryRail.tsx');
    expect(rail.indexOf('home-story-own')).toBeLessThan(rail.indexOf('visible.map('));
    expect(rail).toContain('orderStoriesForBar(');
    expect(rail).toContain('seenBadgeText');
    expect(rail).not.toContain('<ScrollView');
    expect(rail).not.toContain('horizontal');
  });
  it('the profile bar opens the existing Swipe in preview-only mode for your own story', () => {
    const bar = src('components', 'ProfileStoryBar.tsx');
    expect(bar).toContain('previewOnly={isOwnOpen}');
    expect(bar).toContain('loadOwnStory(');
  });
  it('there is a single story-rail component (no duplicate)', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'components', 'StoryRail.tsx'))).toBe(false);
  });
});

describe('musiques en vente dans la story', () => {
  const { mergeSaleTracks, orderStoriesForBar, isSaleStoryTrack, SALE_TRACK_PREFIX } = require('../musicStoriesService');
  const story = (id: string, at: string) => ({ profileId: id, username: `u${id}`, avatarUrl: null, latestAt: at, followed: true, sameStyle: false, tracks: [{ id: `t${id}`, title: 'T', artist: 'A' }] });

  it('appends masked, audible sale tracks (title hidden) and never duplicates them', () => {
    const merged = mergeSaleTracks(story('1', '2026-10-05T10:00:00Z'), [{ trackId: 'x', previewUrl: 'https://a/x.m4a' }, { trackId: 'x', previewUrl: 'https://a/x.m4a' }]);
    const sale = merged.tracks.filter(isSaleStoryTrack);
    expect(sale).toHaveLength(1);
    expect(sale[0].id).toBe(`${SALE_TRACK_PREFIX}x`);
    expect(sale[0].title).toBe('Musique en vente');
    expect(sale[0].previewUrl).toBe('https://a/x.m4a');
  });

  it('puts seen stories last (greyed) and new ones first', () => {
    const a = story('a', '2026-10-05T10:00:00Z');
    const b = story('b', '2026-10-05T09:00:00Z');
    const ordered = orderStoriesForBar([a, b], { a: '2026-10-05T10:00:00Z' });
    expect(ordered.map((s: any) => s.profileId)).toEqual(['b', 'a']);
  });

  it('a new track relights a seen story (latestAt moves past the seen mark)', () => {
    const a = story('a', '2026-10-05T11:00:00Z');
    expect(orderStoriesForBar([a, story('b', '2026-10-05T09:00:00Z')], { a: '2026-10-05T10:00:00Z' })[0].profileId).toBe('a');
  });
});
