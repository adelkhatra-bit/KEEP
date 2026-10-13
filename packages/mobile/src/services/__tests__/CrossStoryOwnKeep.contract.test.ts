import fs from 'fs';
import path from 'path';

const read = (...parts:string[]) => fs.readFileSync(path.resolve(__dirname,...parts),'utf8');
const migration = read('..','..','..','..','..','supabase','migrations','20261013235800_cross_story_keep_identity.sql');
const library = read('..','connectedMusicLibrary.ts');
const modal = read('..','..','components','MusicSwipeDeckModal.tsx');

describe('Cross-story / cross-genre ownership, no duplicate GARDER or FREE charge', () => {
  it('has a server-side exact song fallback in addition to ISRC/provider/preview identity', () => {
    expect(migration).toContain('a.title=b.title and a.artist=b.artist');
    expect(migration).toContain('a.isrc=b.isrc');
    expect(migration).toContain("public.keep_tracks_same_content(track_id,p_track_id)");
    expect(migration).toContain("return jsonb_build_object('ok', true, 'trackId', v_existing.track_id");
  });

  it('guards reads and decisions by the logged-in owner, never the story author', () => {
    expect(migration).toContain('v_uid uuid := auth.uid()');
    expect(migration).toContain('d.profile_id=v_uid');
    expect(migration).toContain('revoke all on function public.keep_check_own_track(uuid) from public,anon');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('SOCIAL_SOURCE_NOT_PUBLIC');
  });

  it('checks the canonical own library RPC before showing a new Keep', () => {
    expect(library).toContain("supabase.rpc('keep_check_own_track'");
    expect(library).toContain('return keepMatchFromDecision({');
    expect(modal).toContain("if (!requiresAccount) {");
    expect(modal).toContain("if (result === null) {");
    expect(modal).toContain("setAlreadyKeptState('yes')");
    expect(modal).toContain("'◌ VÉRIFICATION'");
  });

  it('retains all songs as listenable while dropping repeated display cards', () => {
    expect(modal).toContain("uniqueSwipeTracks([...tracksRef.current])");
    expect(modal).not.toContain('filterSocialSwipeAgainstOwnKeep(');
  });
});
