// @ts-nocheck
import fs from 'fs';
import path from 'path';

const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'ProfileSettingsMobileScreen.tsx'), 'utf8');
const service = fs.readFileSync(path.resolve(__dirname, '..', 'profileService.ts'), 'utf8');

describe('Profile explicit save persists the requested state in Supabase', () => {
  it('allows explicit user edits to clear bio, website, city and birthday while preserving unrelated social links', () => {
    expect(screen).toContain('saveOwnProfile(nextUser, {');
    expect(screen).toContain('allowClearing: true');
    expect(screen).toContain('preserveUneditedCollections: true');
    expect(screen).toContain('preserveUneditedPrivateFields:');
    expect(service).toContain('const desiredSocialLinks = options.preserveUneditedCollections');
    expect(service).toContain(': mergeSocialLinks(existingSocialLinks, user.socialLinks, collectionClearing)');
    expect(service).toContain('const favoriteGenres = options.preserveUneditedCollections');
    expect(service).toContain('music_country_codes: options.preserveUneditedCollections');
    expect(service).toContain('const collectionClearing = allowClearing && !options.preserveUneditedCollections;');
    expect(service).toContain('const persistedAvatar = collectionClearing ? uploadedAvatar');
    expect(service).toContain('if (collectionClearing) {');
    expect(service).toContain('.delete()');
    expect(service).toContain('const birthDate = options.preserveUneditedPrivateFields?.birthDate');
    expect(service).toContain('const gender = options.preserveUneditedPrivateFields?.gender');
    expect(service).toContain('allowClearing');
    expect(service).toContain('keepTextUnlessExplicitlyCleared(user.bio');
    expect(service).toContain('keepTextUnlessExplicitlyCleared(user.website');
  });

  it('only changes local saved profile after network operations succeed', () => {
    const save = screen.slice(screen.indexOf('const save = async () => {'), screen.indexOf('const changeAvatar = async () => {'));
    expect(save.indexOf('setUser(nextUser);')).toBeGreaterThan(save.indexOf('await createProfileService(supabase).saveOwnProfile('));
    expect(save.indexOf('setSaveSuccess(true);')).toBeGreaterThan(save.indexOf('setUser(nextUser);'));
    expect(service).toContain("if (options.allowClearing) throw new Error('Session expirée");
  });
});
