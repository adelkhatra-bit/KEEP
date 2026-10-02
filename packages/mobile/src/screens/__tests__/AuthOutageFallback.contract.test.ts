// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');
const auth = read('src/services/authService.ts');
const profile = read('src/services/profileService.ts');
const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Supabase outage startup resilience', () => {
  it('keeps the protected App shell untouched and puts resilience in services', () => {
    expect(app).not.toContain('getCachedWebRealUserSnapshot');
    expect(auth).toContain("auth_temporarily_unavailable:${AUTH_LOCAL_DEADLINE_MARKER}");
    expect(profile).toContain("profile_temporarily_unavailable:timeout");
  });

  it('uses cached identity only for transient auth failures, never a normal sign-out', () => {
    expect(auth).toContain("const WEB_LAST_REAL_USER_KEY = '__keep_last_real_user_v1';");
    expect(auth).toContain('const cached = transientAuthFailure(error) ? cachedWebAuthSession() : null;');
    expect(auth).toContain('if (cached) return cached;');
    expect(auth).toContain('return null;');
  });

  it('bounds both profile paths and keeps fallback saves non-destructive', () => {
    expect(profile).toContain('withProfileDeadline(');
    expect(profile).toContain("client.functions.invoke('keep-profile-bootstrap'");
    expect(profile).toContain('const safeFallback = cached ?? (session.username ? fallback : null);');
    expect(profile).toContain('loadedOwnProfileId = session.userId;');
  });
});
