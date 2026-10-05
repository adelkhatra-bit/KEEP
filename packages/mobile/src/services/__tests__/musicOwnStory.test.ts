import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { buildOwnStory, STORY_WINDOW_HOURS } from '../musicStoriesService';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();
const track = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `T${id}`, artist: `A${id}`, genres: ['pop'], ...extra }) as any;
const viewer = { id: 'me', username: 'moi', avatarUrl: null };

describe('story personnelle (buildOwnStory)', () => {
  it('contains every identified track of the last 72h, private and masked included', () => {
    const sessions: any[] = [{
      id: 's1', startedAt: hoursAgo(5), endedAt: null, title: null,
      tracks: [
        { id: 'e1', track: track('1'), recommendations: [], status: 'KEPT', visibility: 'PUBLIC', detectedAt: hoursAgo(5) },
        { id: 'e2', track: track('2'), recommendations: [], status: 'KEPT', visibility: 'PRIVATE', detectedAt: hoursAgo(4) },
        { id: 'e3', track: track('3'), recommendations: [], status: 'SKIPPED', detectedAt: hoursAgo(3) },
        { id: 'e4', track: track('4'), recommendations: [], status: 'PENDING', detectedAt: hoursAgo(2) },
      ],
    }];
    const story = buildOwnStory(viewer, sessions, NOW)!;
    expect(story.tracks.map((t) => t.id)).toEqual(['4', '3', '2', '1']);
    expect(story.profileId).toBe('me');
    expect(story.latestAt).toBe(hoursAgo(2));
  });

  it('drops tracks older than the window, duplicates and incomplete tracks; null when empty', () => {
    const old = hoursAgo(STORY_WINDOW_HOURS + 1);
    const sessions: any[] = [{ id: 's', startedAt: old, endedAt: null, title: null, tracks: [
      { id: 'a', track: track('1'), recommendations: [], status: 'KEPT', detectedAt: old },
      { id: 'b', track: track('2'), recommendations: [], status: 'KEPT', detectedAt: hoursAgo(1) },
      { id: 'c', track: track('2'), recommendations: [], status: 'KEPT', detectedAt: hoursAgo(2) },
      { id: 'd', track: { id: '3', title: '', artist: 'x' }, recommendations: [], status: 'KEPT', detectedAt: hoursAgo(1) },
    ] }];
    expect(buildOwnStory(viewer, sessions, NOW)!.tracks.map((t) => t.id)).toEqual(['2']);
    expect(buildOwnStory(viewer, [], NOW)).toBeNull();
  });
});

describe('intégration : ta story dans la rangée de l\'accueil', () => {
  const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('the rail shows « Ta story » first and opens the existing Swipe in preview-only mode', () => {
    const rail = src('components', 'MusicStoryRail.tsx');
    expect(rail).toContain('home-story-own');
    expect(rail.indexOf('home-story-own')).toBeLessThan(rail.indexOf('stories.map('));
    const home = src('screens', 'HomeScreenCompact.tsx');
    expect(home).toContain('buildOwnStory(');
    expect(home).toContain('previewOnly={openStory?.profileId === user?.id}');
    expect(home).not.toContain('<StoryRail');
  });
  it('there is a single story-rail component (no duplicate)', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'components', 'StoryRail.tsx'))).toBe(false);
  });
});
