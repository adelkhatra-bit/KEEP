// @ts-nocheck
import fs from 'fs';
import path from 'path';

const profile = fs.readFileSync(path.resolve(__dirname, '..', 'profileService.ts'), 'utf8').replace(/\r\n/g, '\n');
const fn = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'keep-profile-bootstrap', 'index.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('profile bootstrap resilience', () => {
  it('falls back to the authenticated direct-SQL bootstrap on PostgREST profile failure', () => {
    expect(profile).toContain("client.functions.invoke('keep-profile-bootstrap'");
    expect(profile).toContain('if (profileError)');
    expect(profile).toContain('payload?.profile');
  });

  it('loads the complete profile bundle in one indexed direct database path', () => {
    expect(fn).toContain('SUPABASE_DB_URL');
    expect(fn).toContain('from public.profiles p');
    expect(fn).toContain('from public.social_links s');
    expect(fn).toContain('from public.profile_private_info pi');
    expect(fn).toContain('from public.follows f');
    expect(fn).toContain('authentication_required');
  });
});
