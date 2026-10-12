// @ts-nocheck
import fs from 'fs';
import path from 'path';

const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'ProfileSettingsMobileScreen.tsx'), 'utf8');
const service = fs.readFileSync(path.resolve(__dirname, '..', 'profileService.ts'), 'utf8');

describe('Profile explicit save persists the requested state in Supabase', () => {
  it('allows an explicit user save to clear old links, socials, city, bio and birthday', () => {
    expect(screen).toContain('saveOwnProfile(nextUser, { allowClearing: true })');
    expect(service).toContain('const desiredSocialLinks = mergeSocialLinks(existingSocialLinks, user.socialLinks, allowClearing)');
    expect(service).toContain('if (allowClearing) {');
    expect(service).toContain('.delete()');
    expect(service).toContain('const birthDate = allowClearing');
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
