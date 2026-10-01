// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('owner profile real-session contract', () => {
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const auth = read(__dirname, '..', '..', 'services', 'authService.ts');

  it('tries Supabase refresh before deciding the account is disconnected', () => {
    expect(auth).toContain("typeof (client.auth as any).refreshSession === 'function'");
    expect(auth).toContain('await (client.auth as any).refreshSession()');
    expect(profile).toContain('setRealSessionResolved(true)');
    expect(profile).toContain('const effectiveAuthenticatedUserId = realSessionResolved');
  });

  it('never exposes owner music from stale local state when the real session is absent', () => {
    expect(profile).toContain('const profileKeptTracks = accountRequired ? [] : canonicalOwnKeeps;');
    expect(profile).not.toContain('const profileKeptTracks = accountRequired ? keptTracks : canonicalOwnKeeps;');
  });

  it('keeps an explicit connect/account row immediately under Help in the hamburger', () => {
    const help = profile.indexOf("{ key: 'help'");
    const account = profile.indexOf("{ key: 'account'", help);
    expect(help).toBeGreaterThan(-1);
    expect(account).toBeGreaterThan(help);
    expect(profile.slice(help, account + 220)).toContain("label: 'Compte'");
    expect(profile).toContain("accountRequired ? 'Se connecter' : 'Compte connecté'");
  });
});
