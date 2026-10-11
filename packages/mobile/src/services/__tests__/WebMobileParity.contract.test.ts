import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8');

describe('Web ↔ mobile parity contract', () => {
  const keepAction = read('..', 'keepTrackAction.ts');
  const playlistSale = read('..', 'playlistSaleService.ts');
  const profile = read('..', 'profileService.ts');
  const location = read('..', 'locationService.ts');
  const mic = read('..', 'micCapture.ts');
  const profileSettings = read('..', '..', 'screens', 'ProfileSettingsMobileScreen.tsx');

  it('uses the same KEEP and marketplace business services on web and native', () => {
    expect(keepAction).toContain('checkOwnKeepLibrary(track)');
    expect(keepAction).toContain('recordKeepDecision(track, visibility');
    expect(keepAction).not.toContain("Platform.OS === 'web'");
    expect(playlistSale).toContain("keep_playlist_sale_purchase_with_free");
    expect(playlistSale).toContain("keep_playlist_sale_request_purchase");
    expect(playlistSale).not.toContain("Platform.OS === 'web'");
  });

  it('persists the same profile sources for every runtime', () => {
    expect(profile).toContain("from('profiles').upsert");
    expect(profile).toContain("from('profile_private_info').upsert");
    expect(profile).toContain("from('social_links').upsert");
    expect(profile).toContain("storage.from('avatars').upload");
    expect(profileSettings).toContain('createProfileService(supabase).saveOwnProfile(nextUser)');
  });

  it('keeps GPS behavior equivalent while using the correct platform API', () => {
    expect(location).toContain("if (Platform.OS === 'web')");
    expect(location).toContain('getBrowserCoordinates()');
    expect(location).toContain('Location.getCurrentPositionAsync');
    expect(location).toContain('roundKeepCoordinates');
    expect(profileSettings).toContain('getCurrentKeepLocation()');
    expect(profileSettings).toContain('if (resolved.city) setCity(resolved.city)');
    expect(profileSettings).toContain('if (resolved.countryCode) setCountryCode(resolved.countryCode)');
  });

  it('releases recording resources on both web and native stop paths', () => {
    expect(mic).toContain('recording.stopAndUnloadAsync()');
    expect(mic).toContain('webStream.getTracks().forEach((t) => t.stop())');
    expect(mic).toContain('await setNativeRecordingMode(false)');
    expect(mic).toContain('cancellationVersion += 1');
  });
});
