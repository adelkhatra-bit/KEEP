import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { buildOwnStory, rankMusicStories, STORY_WINDOW_HOURS, MAX_STORY_PROFILES } from '../musicStoriesService';

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

describe('stories des autres (rankMusicStories)', () => {
  const row = (profileId: string, trackId: string, at: string, genres = ['pop']) => ({
    profile_id: profileId, created_at: at,
    profile: { username: `u${profileId}`, avatar_url: null }, track: track(trackId, { genres }),
  });

  it('never includes the viewer, orders newest first, followed first at equal freshness', () => {
    const rows = [row('me', '1', hoursAgo(1)), row('p1', '2', hoursAgo(3)), row('p2', '3', hoursAgo(3)), row('p3', '4', hoursAgo(1))];
    const result = rankMusicStories(rows, 'me', new Set(['p2', 'p3']), new Set(['pop']));
    expect(result.map((s) => s.profileId)).toEqual(['p3', 'p2', 'p1']);
  });

  it('keeps only followed profiles or same-style fans, and caps the rail', () => {
    const rows = [row('x', '1', hoursAgo(1), ['jazz'])];
    expect(rankMusicStories(rows, 'me', new Set(), new Set(['pop']))).toHaveLength(0);
    const many = Array.from({ length: MAX_STORY_PROFILES + 5 }, (_, i) => row(`p${i}`, `t${i}`, hoursAgo(1)));
    expect(rankMusicStories(many, 'me', new Set(many.map((_, i) => `p${i}`)), new Set()).length).toBe(MAX_STORY_PROFILES);
  });
});

describe('intégration accueil', () => {
  const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('Home shows the story rail right under the top bar with reserved height', () => {
    const home = src('screens', 'HomeScreenCompact.tsx');
    expect(home).toMatch(/<TopBar navigation=\{navigation\} readyCount=\{detected\} \/>\n\s*\{storyRail\}/);
    expect((home.match(/\{storyRail\}/g) || []).length).toBe(2);
    const rail = src('components', 'StoryRail.tsx');
    expect(rail).toContain('wrap: { height: 96');
    expect(rail).toContain('story-bubble-own');
    expect(rail).toContain('previewOnly={isOwnOpen}');
  });
});
