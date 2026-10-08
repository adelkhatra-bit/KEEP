import fs from 'fs';
import path from 'path';

jest.mock('../keepTrackAction', () => ({ commitKeep: jest.fn() }));
jest.mock('../lokiPulseService', () => ({ markLokiPulseTrackKept: jest.fn(async () => undefined) }));
jest.mock('../supabaseClient', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../playlistSaleService', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../../utils/keepAlert', () => ({ Alert: { alert: jest.fn() } }));

import { commitKeep } from '../keepTrackAction';
import { keepLokiPulseTrack } from '../lokiPulseKeep';
import { firstDiscoveryFreeLabel, loadFirstDiscoveryOrigins } from '../trackOriginService';
import { formatStoryTouches, loadMyStoryViewers, watchStoryOf } from '../musicStoriesService';
import { supabase } from '../supabaseClient';

const rpc = supabase!.rpc as jest.Mock;
const track = { id: '11111111-2222-3333-4444-555555555555', title: 'Titre', artist: 'Artiste' } as any;
const read = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('issue 63 — GARDER en story, récompense et provenance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('utilise le GARDER débité unique avec la provenance de story et le choix privé', async () => {
    (commitKeep as jest.Mock).mockResolvedValue({ alreadyKept: false });
    expect(await keepLokiPulseTrack(track, 'PRIVATE', 3, { profileId: 'partageur', username: 'ami' })).toEqual({ ok: true, alreadyKept: false });
    expect(commitKeep).toHaveBeenCalledWith(track, [], undefined, {
      visibility: 'PRIVATE', consumeCredit: true,
      context: { source: 'story', recommendation: 'story_swipe', sourceProfileId: 'partageur', sourceUsername: 'ami' },
    });
    expect((commitKeep as jest.Mock).mock.calls[0][3]).not.toHaveProperty('socialFree');
  });

  it('conserve un résultat déjà gardé sans demander un second débit', async () => {
    (commitKeep as jest.Mock).mockResolvedValue({ alreadyKept: true });
    expect(await keepLokiPulseTrack(track, 'PUBLIC', 3)).toEqual({ ok: true, alreadyKept: true });
    expect(commitKeep).toHaveBeenCalledTimes(1);
  });

  it('ne transforme pas un débit refusé en succès', async () => {
    (commitKeep as jest.Mock).mockRejectedValue(new Error('CREDITS_EXHAUSTED'));
    expect(await keepLokiPulseTrack(track, 'PUBLIC', 3)).toEqual({ ok: false, alreadyKept: false });
  });

  it('revérifie une musique libre après son premier GARDER et ignore les ids de vente', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await loadFirstDiscoveryOrigins([track.id, `sale:${track.id}`], { requireConfirmed: true })).toEqual({});
    rpc.mockResolvedValueOnce({ data: [{ track_id: track.id, profile_id: 'premier', username: 'loki' }], error: null });
    expect(await loadFirstDiscoveryOrigins([track.id], { requireConfirmed: true })).toEqual({ [track.id]: { profileId: 'premier', username: 'loki' } });
    expect(rpc).toHaveBeenNthCalledWith(1, 'keep_track_first_discoveries', { p_track_ids: [track.id] });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('une panne de provenance ne certifie jamais une musique comme libre', async () => {
    rpc.mockResolvedValue({ error: new Error('offline') });
    await expect(loadFirstDiscoveryOrigins(['22222222-2222-3333-4444-555555555555'], { requireConfirmed: true })).rejects.toThrow('offline');
  });

  it('ma story ne force pas le mode aperçu et annonce le tarif réglable', () => {
    const bar = read('../../components/ProfileStoryBar.tsx');
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    expect(bar).not.toContain('previewOnly={isOwnOpen}');
    expect(bar).toContain('keepDebitAmount={freeCost}');
    expect(deck).toContain('firstDiscoveryFreeLabel(current.id, originsConfirmed, firstOrigins)');
    expect(deck).toContain("currentAlreadyKept");
  });

  it('le badge Libre commun ne dépend pas d’une date de story et n’invente pas une absence', () => {
    expect(firstDiscoveryFreeLabel(track.id, true, {})).toBe('Libre · à découvrir par toi');
    expect(firstDiscoveryFreeLabel(track.id, false, {})).toBeNull();
    expect(firstDiscoveryFreeLabel(track.id, true, { [track.id]: { profileId: 'premier', username: 'ami' } })).toBeNull();
    expect(firstDiscoveryFreeLabel('itunes:123', true, {})).toBeNull();
    const deck = read('../../components/MusicSwipeDeckModal.tsx');
    const home = read('../../screens/HomeScreenCompact.tsx');
    expect(deck).toContain('useFirstDiscoveryOrigins(deckTracks.map((track) => track.id), visible)');
    expect(home).toContain('useFirstDiscoveryOrigins([current?.track.id');
    expect(home).toContain('listen-free-discovery-badge');
    expect(deck).toContain('freeDiscoveryLabel && !currentAlreadyKept');
  });

  it('la migration réutilise les registres protégés, borne et déduplique les gains futurs', () => {
    const sql = read('../../../../../supabase/migrations/20261008103000_story_discovery_rewards.sql');
    expect(sql).toContain("('first_discovery_free_per_keep','3'::jsonb");
    expect(sql).toContain("('first_discovery_monthly_free_cap','20'::jsonb");
    expect(sql).toContain('discoverer=new.profile_id');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('least(reward,greatest(0,cap-month_reward))');
    expect(sql).toContain('on conflict(keep_decision_id) do nothing');
    expect(sql).toContain('keeper_profile_id=new.profile_id and track_id=new.track_id');
    expect(sql).toContain('on conflict(track_id) do nothing');
    const edge = read('../../../../../supabase/functions/keep-music-core/index.ts');
    expect(edge).toContain('scoped.rpc("keep_commit_paid_decision"');
    const paid = read('../../../../../supabase/migrations/20261003021000_preserve_original_music_discoverer.sql');
    expect(paid).toContain("raise exception 'CREDITS_EXHAUSTED'");
    expect(paid).toContain("'deduplicated',true");
    expect(sql).not.toMatch(/create table|update public\.(keep_decisions|keep_free_economy_events|keep_track_first_discoveries)/i);
  });
});

describe('issue 63 — vraies touches de story, autres membres uniquement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('affiche le compteur serveur et l’âge de la dernière visite', () => {
    expect(formatStoryTouches({ touchCount: 4, viewedAt: '2026-10-08T10:00:00Z' }, Date.parse('2026-10-08T10:07:55Z'))).toBe('touché 4 fois · il y a 7 min');
    expect(formatStoryTouches({ touchCount: 1, viewedAt: 'invalide' })).toBe('touché 1 fois');
    expect(formatStoryTouches({ viewedAt: 'invalide' })).toBe('touché … fois');
  });

  it('appelle explicitement la v4 actuelle et préserve les chapitres', async () => {
    rpc.mockResolvedValue({ data: [{
      viewer_id: 'visiteur', username: 'ami', viewed_at: '2026-10-08T10:00:00Z',
      chapters: [{ i: 0, s: 4, t: track.id }],
      playback_progress: { touch_count: 3, last_track_id: track.id },
    }], error: null });
    expect((await loadMyStoryViewers())[0]).toMatchObject({
      touchCount: 3, chapters: [{ index: 0, seconds: 4 }],
      trackViews: [{ trackId: track.id, seconds: 4 }], lastTrackId: track.id,
    });
    expect(rpc).toHaveBeenCalledWith('keep_my_story_viewers_v4', { p_track_id: null, p_published_at: null });
  });

  it('le serveur compte uniquement les sessions de ma story par les autres, sans réécrire les sessions', () => {
    const sql = read('../../../../../supabase/migrations/20261008103000_story_discovery_rewards.sql');
    expect(sql).toContain('s.owner_id=auth.uid() and s.viewer_id<>auth.uid()');
    expect(sql).toContain("'touch_count',(select count(*) from sessions");
    expect(sql).toContain("from public,anon");
    expect(sql).not.toContain('update public.story_watch_sessions');
  });

  it('l’enchaînement automatique ne démarre aucune session ni touche', async () => {
    jest.useFakeTimers();
    try {
      expect(watchStoryOf('autre-membre', 3, false)).toBeNull();
      await jest.advanceTimersByTimeAsync(3000);
      expect(rpc).not.toHaveBeenCalled();
      const bar = read('../../components/ProfileStoryBar.tsx');
      expect(bar).toContain('watchStoryOf(story.profileId, ordered.length, intentional)');
      expect(bar).toContain('open(upcoming, false)');
    } finally {
      jest.useRealTimers();
    }
  });

  it('un appui explicite conserve les 2 s et le suivi des chapitres', async () => {
    jest.useFakeTimers();
    rpc.mockImplementation(async (name) => ({ data: name === 'keep_story_watch_start' ? 'session' : null, error: null }));
    const tracker = watchStoryOf('autre-membre', 3, true)!;
    try {
      tracker.event({ type: 'shown', trackId: track.id, index: 0, total: 3 });
      await jest.advanceTimersByTimeAsync(1999);
      expect(rpc).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(rpc).toHaveBeenCalledWith('keep_story_watch_start', { p_owner_id: 'autre-membre', p_tracks_total: 3 });
      expect(rpc).toHaveBeenCalledWith('keep_story_watch_chapters_ping', expect.objectContaining({
        p_tracks_seen: 1, p_chapters: [expect.objectContaining({ i: 0, t: track.id })],
      }));
    } finally {
      tracker.stop();
      jest.useRealTimers();
    }
  });
});
