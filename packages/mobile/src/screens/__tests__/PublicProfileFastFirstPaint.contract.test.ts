// @ts-nocheck
import fs from 'fs';
import path from 'path';

const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'profileService.ts'), 'utf8').replace(/\r\n/g, '\n');
const screen = fs.readFileSync(path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('public profile fast first paint contract', () => {
  it('never waits for profile-view notification before returning the public identity', () => {
    expect(service).toContain("void client.auth.getUser()");
    expect(service).toContain("client.rpc('notify_profile_view'");
    expect(service).not.toContain("await client.rpc('notify_profile_view'");
  });

  it('ends the full-screen loading state immediately after safe public identity load', () => {
    const setProfileIndex = screen.indexOf('setProfile(result);');
    const firstPaintIndex = screen.indexOf('if (coldLoad) setLoading(false);');
    const keepsIndex = screen.indexOf('await loadPublicProfileKeeps(result.id);');
    expect(setProfileIndex).toBeGreaterThan(-1);
    expect(firstPaintIndex).toBeGreaterThan(setProfileIndex);
    expect(keepsIndex).toBeGreaterThan(firstPaintIndex);
  });

  it('keeps heavy profile sections progressive instead of blocking the identity shell', () => {
    expect(screen).toContain('loadPublicProfileSnapshot(result.id)');
    expect(screen).toContain('loadProfileDiscoveryImpacts(result.id)');
    expect(screen).toContain('loadPublicProfileKeeps(result.id)');
  });
});
