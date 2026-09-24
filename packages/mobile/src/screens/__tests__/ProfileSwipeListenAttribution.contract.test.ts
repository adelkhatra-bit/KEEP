// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Visited profile Swipe listen attribution', () => {
  const swipe = read(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx');
  const service = read(__dirname, '..', '..', 'services', 'profileSwipeListenService.ts');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924164048_profile_swipe_listen_attribution.sql');

  it('binds the visited profile id to the Swipe source identity', () => {
    expect(publicProfile).toContain('sourceProfileId={profile.id}');
    expect(publicProfile).toContain('sourceUsername={profile.username}');
  });

  it('records only after preview playback really starts', () => {
    expect(swipe).toContain('sourceProfileId?: string;');
    expect(swipe).toContain('if (playing && sourceProfileId)');
    expect(swipe).toContain('recordProfileSwipeListen(sourceProfileId, current.id)');
  });

  it('never sends authenticated attribution from guest or demo mode', () => {
    expect(service).toContain('account.isLocalGuest');
    expect(service).toContain('account.isDemoMode');
    expect(service).toContain('listenerId === sourceProfileId');
    expect(service).toContain("supabase.rpc('keep_profile_swipe_listen_record'");
  });

  it('server accepts only public non-paywalled tracks and deduplicates listens', () => {
    expect(migration).toContain("kd.visibility = 'PUBLIC'");
    expect(migration).toContain('keep_playlist_sale_masked_track_ids(p_source_profile_id)');
    expect(migration).toContain("interval '30 minutes'");
    expect(migration).toContain('listener_id <> source_profile_id');
  });
});
