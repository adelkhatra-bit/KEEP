// @ts-nocheck
import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }));
jest.mock('../supabaseClient', () => ({ supabase: null }));

import { MAX_STORY_PROFILES, rankMusicStories } from '../musicStoriesService';

const row = (profileId, createdAt, genres = ['hip-hop/rap'], trackId = `${profileId}-${createdAt}`) => ({
  profile_id: profileId,
  created_at: createdAt,
  profile: { username: `u_${profileId}`, avatar_url: null },
  track: { id: trackId, title: 'Titre', artist: 'Artiste', genres, preview_url: 'https://audio-ssl.itunes.apple.com/x.m4a' },
});

describe('Stories musicales (Adel, 05/10/2026)', () => {
  it('garde les profils suivis et les passionnés du même style, jamais le reste ni soi-même', () => {
    const stories = rankMusicStories(
      [row('me', '2026-10-05T04:00:00Z'), row('followed', '2026-10-05T03:00:00Z', ['jazz']), row('fan', '2026-10-05T02:00:00Z'), row('other', '2026-10-05T05:00:00Z', ['metal'])],
      'me', new Set(['followed']), new Set(['hip-hop/rap']),
    );
    expect(stories.map((s) => s.profileId)).toEqual(['followed', 'fan']);
    expect(stories[1].sameStyle).toBe(true);
  });

  it('met toujours la story la plus récente en premier et regroupe les morceaux par profil', () => {
    const stories = rankMusicStories(
      [row('a', '2026-10-05T01:00:00Z'), row('b', '2026-10-05T04:00:00Z'), row('a', '2026-10-05T05:00:00Z')],
      'me', new Set(), new Set(['hip-hop/rap']),
    );
    expect(stories[0].profileId).toBe('a');
    expect(stories[0].tracks).toHaveLength(2);
  });

  it('plafonne la rangée pour ne jamais noyer l’utilisateur', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`p${i}`, `2026-10-05T0${i % 10}:00:00Z`));
    expect(rankMusicStories(rows, 'me', new Set(), new Set(['hip-hop/rap']))).toHaveLength(MAX_STORY_PROFILES);
  });

  it('profil : bulles à côté de la photo (plus sur Écouter), Swipe et économie FREE réutilisés, texte >= 11 px', () => {
    const profile = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'ProfilePublicScreen.tsx'), 'utf8');
    const identity = profile.indexOf('<View style={s.identityText}>');
    const bar = profile.indexOf('<ProfileStoryBar');
    expect(bar).toBeGreaterThan(identity);
    expect(bar).toBeLessThan(profile.indexOf('<View style={s.usernameLine}>'));
    const home = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx'), 'utf8');
    expect(home).not.toContain('MusicStoryRail');
    const bar_src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(bar_src).toContain("keepLokiPulseTrack(track, visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', freeCost)");
    const railSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'MusicStoryRail.tsx'), 'utf8');
    const sizes = [...railSource.matchAll(/fontSize:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });
});
