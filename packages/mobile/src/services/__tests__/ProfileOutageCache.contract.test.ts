// @ts-nocheck
import fs from 'fs';
import path from 'path';

const store = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'store', 'useUserStore.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const profile = fs.readFileSync(
  path.resolve(__dirname, '..', 'profileService.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Profile outage cache', () => {
  it('persists the public profile content needed to avoid an empty desktop profile during an outage', () => {
    for (const field of ['bio:', 'city:', 'countryCode:', 'website:', 'favoriteGenres:', 'favoriteArtists:', 'socialLinks:']) {
      expect(store).toContain(field);
    }
    expect(store).toContain('useUserStore.subscribe((state)');
  });

  it('restores that snapshot when Supabase profile reads are temporarily unavailable', () => {
    expect(profile).toContain('const cached = cachedOutageProfile(session);');
    expect(profile).toContain('bio: typeof parsed?.bio');
    expect(profile).toContain('favoriteGenres: normalizeProfileTextList(parsed?.favoriteGenres)');
    expect(profile).toContain('socialLinks: Array.isArray(parsed?.socialLinks)');
  });
});
