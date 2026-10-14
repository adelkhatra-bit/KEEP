import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (relative: string) => fs.readFileSync(path.join(root,relative),'utf8');
const sql = fs.readFileSync(path.resolve(root,'..','..','..','supabase','migrations',
  '20261013235500_pulse_similar_profiles_by_real_taste.sql'),'utf8');
const pulse = read('screens/ProfilePublicScreen.tsx');
const swipe = read('components/MusicSwipeDeckModal.tsx');
const api = read('services/pulseSimilarProfilesService.ts');

describe('Loki Pulse people with matching musical preferences', () => {
  it('uses explicit AND learned genres, compatible artists, never synthetic members', () => {
    expect(sql).toContain('favorite_genres');
    expect(sql).toContain('inferred_genres');
    expect(sql).toContain('favorite_artists');
    expect(sql).toContain('inferred_artists');
    expect(sql).toContain('keep_my_taste_profile()');
    expect(sql).toContain('keep_music_style_key');
    expect(sql).toContain('m.common_genres+m.common_artists');
    expect(api).toContain("supabase.rpc('keep_pulse_similar_profiles'");
    expect(api).not.toContain('mockProfiles');
  });

  it('protects public privacy, blocks and follows, no anonymous access', () => {
    expect(sql).toContain('coalesce(p.is_public,false)=true');
    expect(sql).toContain('coalesce(p.discovery_hidden,false)=false');
    expect(sql).toContain('public.user_blocks');
    expect(sql).toContain('public.follows');
    expect(sql).toContain('revoke all on function public.keep_pulse_similar_profiles(integer) from public,anon');
    expect(sql).toContain('grant execute on function public.keep_pulse_similar_profiles(integer) to authenticated');
  });

  it('displays real similar profiles alongside music and events with visible rationale', () => {
    expect(pulse).toContain('testID="loki-pulse-people-same-style"');
    expect(pulse).toContain('pulseSimilarProfiles.map((person)');
    expect(pulse).toContain("navigation.navigate('PublicProfile', { username: person.username })");
    expect(pulse).toContain('person.sharedStyle');
    expect(pulse).toContain('loadPulseSimilarProfiles(8)');
  });
});

describe('Story viewer does not automatically impose third-party provider advertisements', () => {
  it('never autoplays an ad-supported provider iframe in a public 24-hour Story', () => {
    expect(swipe).toContain('const preferCleanStoryPlayer = true');
    expect(swipe).toContain('Boolean(trackAddedAt) && !preferCleanStoryPlayer');
    expect(swipe).toContain('STORY_PREVIEW_NO_AD_FREE_AUDIO');
    expect(swipe).toContain('testID="story-no-provider-ads"');
    expect(swipe).toContain('2400');
  });

  it('does not expose paid track identity or change paid Story rules', () => {
    expect(swipe).toContain('!isSaleStoryTrack(current) && !currentOffered && !ownerMasked');
    expect(swipe).toContain('isSaleStoryTrack(current)');
  });
});
