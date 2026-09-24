import fs from 'fs';
import path from 'path';

describe('profile persistence contract', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'profileService.ts'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PublicProfilePanel.tsx'), 'utf8');
  const avatarService = fs.readFileSync(path.resolve(__dirname, '..', 'avatarService.ts'), 'utf8');
  const migration = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260924131500_social_link_label_persistence.sql'),
    'utf8',
  );

  it('keeps the required profile fields backed by Supabase', () => {
    for (const marker of [
      'bio:',
      'avatar_url:',
      'country_code:',
      'city:',
      'website:',
      'birth_date:',
      'gender,',
      "from('profile_private_info')",
      "from('social_links')",
    ]) {
      expect(service).toContain(marker);
    }
    expect(avatarService).toContain("storage.from('avatars')");
  });

  it('persists the website button label without breaking pre-migration clients', () => {
    expect(service).toContain("platform, url, visibility, label");
    expect(service).toContain('label: link.label ?? null');
    expect(service).toContain('isMissingSocialLabelColumn');
    expect(migration).toContain('add column if not exists label text');
    expect(panel).toContain("{ platform: 'website', url, label, visibility:");
  });
});
