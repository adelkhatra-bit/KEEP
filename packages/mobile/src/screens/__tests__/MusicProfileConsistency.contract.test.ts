// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Music profile consistency', () => {
  const profileService = read(__dirname, '..', '..', 'services', 'publicProfileStateService.ts');
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const myMusic = read(__dirname, '..', 'MyMusicScreen.tsx');
  const visitor = read(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('uses PUBLIC + PRIVATE keeps for the owner profile style source', () => {
    expect(profileService).toContain("return loadPagedKeeps('keep_own_profile_tracks', {});");
    expect(profileService).not.toContain("rows.filter((row) => row.visibility === 'PUBLIC')");
  });

  it('shows the same real style concept in MyMusic and owner profile', () => {
    expect(profile).toContain('Mes styles');
    expect(profile).toContain('{genreFolders.length} style');
    expect(myMusic).toContain('MES STYLES · {stylePlaylists.length}');
    expect(myMusic).toContain('SUGGESTIONS AUTO');
    expect(myMusic).toContain('ne sont PAS comptées dans tes {stylePlaylists.length} Styles');
  });

  it('opens music management with explicit per-track actions', () => {
    expect(profile).toContain("params: { openManageMusic: true }");
    expect(myMusic).toContain('MODE GESTION ACTIF');
    expect(myMusic).toContain('PUBLIC / PRIVÉ');
    expect(myMusic).toContain('SUPPRIMER');
    expect(myMusic).toContain('AJOUTER À UNE COLLECTION');
  });

  it('pre-resolves the next visitor preview to avoid gaps between tracks', () => {
    expect(visitor).toContain('inlinePreviewUrlCacheRef');
    expect(visitor).toContain('const resolveInlinePreview = async');
    expect(visitor).toContain('const nextCandidate = candidates[index + 1]');
    expect(visitor).toContain('void resolveInlinePreview(nextCandidate)');
    expect(visitor).toContain('void playInlineQueueItem(label, candidates, nextIndex, generation)');
  });
});
